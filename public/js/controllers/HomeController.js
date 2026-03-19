/**
 * App.Controllers.HomeController
 * Renders and drives the Honeycolm homepage.
 *
 * Sections:
 *   - Hero (tagline, subheadline, CTA)
 *   - How It Works (3-step explainer)
 *   - Active Swarms preview (up to 4 SwarmCards)
 *   - Past Winners preview (up to 3 winner cards)
 *
 * Offline-capable: swarm list is cached in IndexedDB store 'swarms-cache'
 * under key 'home-list'. On API failure the cached list is rendered with
 * a "Showing cached data" badge.
 */

'use strict';

window.App          = window.App          || {};
App.Controllers     = App.Controllers     || {};

App.Controllers.HomeController = class HomeController extends App.Controllers.BaseController {

    constructor() {
        super();
        /** @type {IDBDatabase|null} */
        this._db = null;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    /**
     * Entry point — called once on DOM ready.
     * Renders structural sections immediately, then fires async data loads.
     * @returns {void}
     */
    init() {
        this.renderHero();
        this.renderHowItWorks();
        this.loadSwarms();
        this.loadWinners();
    }

    // -------------------------
    // Render helpers
    // -------------------------

    /**
     * Inject the full homepage skeleton into #app-root.
     * Hero background: var(--hive-brown) with .hero-honeycomb overlay at 0.12 opacity.
     * @returns {void}
     */
    renderHero() {
        const html = `
<section class="hero" aria-label="Welcome to Honeycolm">
    <div class="hero-honeycomb" aria-hidden="true"></div>
    <div class="hero-content">
        <h1 class="hero-tagline">Hive in. Win big.</h1>
        <p class="hero-sub">The hive pools together. One lucky bee takes home the honey. Join a Swarm, buy your Comb, and let the hive do the rest.</p>
        <a href="/ca/register" class="btn-primary btn-hero">Join the Hive</a>
    </div>
</section>
<section id="how-it-works" class="how-it-works">
    <div class="hiw-inner">
        <h2 class="hiw-heading">How It Works</h2>
        <div class="hiw-grid"></div>
    </div>
</section>
<section id="active-swarms-preview" class="swarms-preview">
    <div class="swarms-preview-inner">
        <h2 class="swarms-preview-heading">Active Swarms</h2>
        <div class="swarms-grid" id="swarms-grid-home">
            <div class="page-loading"><span class="spinner"></span> Loading Swarms&hellip;</div>
        </div>
        <a href="/ca/swarms" class="see-all">See all Swarms &rarr;</a>
    </div>
</section>
<section id="winners-preview" class="winners-preview">
    <div class="winners-preview-inner">
        <h2 class="winners-preview-heading">Recent winners</h2>
        <div class="winners-grid" id="winners-grid">
            <div class="page-loading"><span class="spinner"></span> Loading&hellip;</div>
        </div>
    </div>
</section>`;

        $('#app-root').html(html);
    }

    /**
     * Populate the How It Works 3-step grid.
     * Called after renderHero() so #how-it-works already exists in the DOM.
     * @returns {void}
     */
    renderHowItWorks() {
        const steps = [
            {
                number: '1',
                title:  'Browse Swarms',
                desc:   'Find the item you want. Pick your Swarm.',
            },
            {
                number: '2',
                title:  'Buy your Combs',
                desc:   'Each Comb is your entry. The more Combs you hold, the higher your odds.',
            },
            {
                number: '3',
                title:  'The Dip happens',
                desc:   'When the Swarm fills, Random.org selects one lucky bee to take home the honey.',
            },
        ];

        const stepsHtml = steps.map((step) => `
<div class="hiw-step">
    <span class="hiw-number" aria-hidden="true">${step.number}</span>
    <h3 class="hiw-title">${step.title}</h3>
    <p class="hiw-desc">${step.desc}</p>
</div>`).join('');

        $('#how-it-works .hiw-grid').html(stepsHtml);
    }

    // -------------------------
    // Data loaders
    // -------------------------

    /**
     * Fetch up to 4 active swarms from the API and render them as SwarmCards.
     * On success: writes result to IndexedDB 'swarms-cache' / 'home-list'.
     * On failure: reads IndexedDB fallback and renders with an offline badge.
     * @returns {Promise<void>}
     */
    async loadSwarms() {
        try {
            const response = await App.Services.ApiService.getInstance().get('/swarms?region=ca&limit=4');
            const swarms   = (response && response.data) ? response.data : [];

            this._renderSwarmCards(swarms, false);
            await this._cacheSwarms(swarms);
        } catch (err) {
            const cached = await this._readCachedSwarms();
            if (cached && cached.length > 0) {
                this._renderSwarmCards(cached, true);
            } else {
                $('#swarms-grid-home').html(
                    '<p class="empty-state">Check back soon \u2014 new Swarms are on the way.</p>'
                );
            }
        }
    }

    /**
     * Fetch up to 3 completed swarms and their draw results, then render winner cards.
     * On failure renders a warm empty state.
     * @returns {Promise<void>}
     */
    async loadWinners() {
        try {
            const response = await App.Services.ApiService.getInstance().get('/swarms?region=ca&status=draw_complete&limit=3');
            const swarms   = (response && response.data) ? response.data : [];

            if (!swarms.length) {
                this._renderWinnersEmpty();
                return;
            }

            const resultPromises = swarms.map((swarm) =>
                App.Services.ApiService.getInstance()
                    .get(`/swarms/${swarm.id}/result`)
                    .catch(() => null)
            );

            const results = await Promise.all(resultPromises);

            const winnerCards = results
                .filter((r) => r && r.data)
                .map((r) => {
                    const result      = r.data;
                    const firstName   = result.winner_first_name || 'A lucky bee';
                    const city        = result.winner_city        || 'Canada';
                    const productName = result.product_name       || 'an item';
                    const drawDate    = result.draw_date
                        ? new Date(result.draw_date).toLocaleDateString('en-CA', {
                              year: 'numeric', month: 'long', day: 'numeric',
                          })
                        : '';

                    return `<div class="winner-card">
    <strong class="winner-name">${HomeController._escape(firstName)}</strong>
    <span class="winner-city">from ${HomeController._escape(city)}</span>
    <span class="winner-item">won <em>${HomeController._escape(productName)}</em></span>
    ${drawDate ? `<span class="winner-date">${HomeController._escape(drawDate)}</span>` : ''}
</div>`;
                });

            if (winnerCards.length) {
                $('#winners-grid').html(winnerCards.join(''));
            } else {
                this._renderWinnersEmpty();
            }
        } catch (err) {
            this._renderWinnersEmpty();
        }
    }

    // -------------------------
    // Private render helpers
    // -------------------------

    /**
     * Insert swarm cards into the grid.
     * Calls CountdownTimer.startAll() after cards are in the DOM.
     * @param {Object[]} swarms
     * @param {boolean}  offline  Whether to prepend the offline badge
     * @returns {void}
     */
    _renderSwarmCards(swarms, offline) {
        const $grid = $('#swarms-grid-home');
        $grid.empty();

        if (offline) {
            $grid.append('<div class="offline-badge">Showing cached data</div>');
        }

        if (!swarms.length) {
            $grid.append('<p class="empty-state">No active Swarms right now \u2014 check back soon.</p>');
            return;
        }

        swarms.forEach((swarm) => {
            $grid.append(App.Components.SwarmCard.render(swarm));
        });

        // Must be called after cards are inserted into the DOM
        App.Components.CountdownTimer.startAll();
    }

    /**
     * Render the winners empty state message.
     * @returns {void}
     */
    _renderWinnersEmpty() {
        $('#winners-grid').html(
            '<p class="empty-state">Check back soon \u2014 The Dip is always around the corner.</p>'
        );
    }

    // -------------------------
    // IndexedDB helpers
    // -------------------------

    /**
     * Open (or reuse) the IndexedDB database with store 'swarms-cache'.
     * @returns {Promise<IDBDatabase>}
     */
    _openDb() {
        if (this._db) {
            return Promise.resolve(this._db);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('honeycolm', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('swarms-cache')) {
                    db.createObjectStore('swarms-cache');
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Write the swarm list to IndexedDB under key 'home-list'.
     * @param {Object[]} swarms
     * @returns {Promise<void>}
     */
    async _cacheSwarms(swarms) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx    = db.transaction('swarms-cache', 'readwrite');
                const store = tx.objectStore('swarms-cache');
                const req   = store.put(swarms, 'home-list');
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            // Non-critical — silently swallow cache write failures
        }
    }

    /**
     * Read the cached swarm list from IndexedDB.
     * Returns null if the store is empty or the read fails.
     * @returns {Promise<Object[]|null>}
     */
    async _readCachedSwarms() {
        try {
            const db = await this._openDb();
            return await new Promise((resolve, reject) => {
                const tx    = db.transaction('swarms-cache', 'readonly');
                const store = tx.objectStore('swarms-cache');
                const req   = store.get('home-list');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            return null;
        }
    }

    // -------------------------
    // Static utilities
    // -------------------------

    /**
     * Escape a value for safe HTML text insertion.
     * @param {string} str
     * @returns {string}
     */
    static _escape(str) {
        if (typeof str !== 'string') { return ''; }
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};

// HomeController is now booted by App._initRouteController() for the homepage route only.
