/**
 * App.Controllers.PastWinnersController
 * Renders the Past Winners page with paginated draw results.
 *
 * - Fetches GET /swarms?status=draw_complete&region=ca&page={n}&per_page=12
 * - Renders winner cards with first name, city, product, date, Random.org link
 * - "Load more" pagination appends next page of results
 * - Caches results in IndexedDB store 'winners-cache' for offline reads
 *
 * Privacy: only first name is displayed — never full name or any other PII.
 */

'use strict';

window.App          = window.App          || {};
App.Controllers     = App.Controllers     || {};

App.Controllers.PastWinnersController = class PastWinnersController extends App.Controllers.BaseController {

    constructor() {
        super();
        /** @type {number} Current page number */
        this._page = 1;
        /** @type {number} Results per page */
        this._perPage = 12;
        /** @type {Object[]} Accumulated winner results */
        this._allWinners = [];
        /** @type {IDBDatabase|null} */
        this._db = null;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    /**
     * Entry point — renders the page shell and loads the first page of winners.
     * @returns {void}
     */
    init() {
        App.Utils.SEO.setPageMeta({
            title:       'Past Winners — Honeycolm',
            description: 'Real winners, real products. Every Honeycolm draw is verified by Random.org.',
            canonical:   'https://honeycolm.ca/ca/past-winners',
        });

        this._renderShell();
        this.loadWinners(1);
    }

    // -------------------------
    // Render
    // -------------------------

    /**
     * Inject the page skeleton (hero + winners container) into #app-root.
     * @returns {void}
     */
    _renderShell() {
        const html = `
<section class="page-hero page-hero--dark">
    <h1>Past winners</h1>
    <p>Real products. Real winners. Every Swarm, verified by Random.org.</p>
</section>
<section class="winners-section">
    <div class="winners-grid" id="winners-grid">
        <div class="page-loading"><span class="spinner"></span> Loading winners&hellip;</div>
    </div>
    <div id="winners-pagination" class="text-center mt-3"></div>
</section>`;

        $('#app-root').html(html);
    }

    // -------------------------
    // Data loading
    // -------------------------

    /**
     * Fetch a page of draw_complete swarms from the API.
     * On success: appends winner cards and caches data to IndexedDB.
     * On failure: attempts to read cached results and displays offline badge.
     * @param {number} page
     * @returns {Promise<void>}
     */
    async loadWinners(page) {
        try {
            const endpoint = '/swarms?status=draw_complete&region=ca&page=' + page + '&per_page=' + this._perPage;
            const response = await App.Services.ApiService.getInstance().get(endpoint);
            const swarms   = (response && response.data) ? response.data : [];

            // On first page, clear loading state
            if (page === 1) {
                $('#winners-grid').empty();
            }

            if (swarms.length === 0 && page === 1) {
                $('#winners-grid').html(
                    '<p class="empty-state">No completed Swarms yet \u2014 check back soon.</p>'
                );
                $('#winners-pagination').empty();
                return;
            }

            // Append cards
            swarms.forEach((swarm) => {
                this._allWinners.push(swarm);
                $('#winners-grid').append(this._renderWinnerCard(swarm));
            });

            // Cache all accumulated results
            await this._cacheWinners(this._allWinners);

            // Show or hide Load More
            if (swarms.length < this._perPage) {
                // No more pages
                $('#winners-pagination').empty();
            } else {
                this._renderLoadMore();
            }
        } catch (err) {
            // Offline fallback
            if (page === 1) {
                const cached = await this._readCachedWinners();
                if (cached && cached.length > 0) {
                    $('#winners-grid').empty();
                    $('#winners-grid').append('<div class="offline-badge">Showing cached data</div>');
                    cached.forEach((swarm) => {
                        $('#winners-grid').append(this._renderWinnerCard(swarm));
                    });
                    this._allWinners = cached;
                    $('#winners-pagination').empty();
                } else {
                    $('#winners-grid').html(
                        '<p class="empty-state">Unable to load winners right now. Please check your connection.</p>'
                    );
                }
            } else {
                this.showError('Unable to load more winners. Please try again.');
            }
        }
    }

    // -------------------------
    // Card rendering
    // -------------------------

    /**
     * Render a single winner card from a draw_complete swarm object.
     * Only exposes: first name, city, product name, draw date, Random.org verify link.
     * @param {Object} swarm
     * @returns {string}
     */
    _renderWinnerCard(swarm) {
        const draw        = swarm.draw || {};
        const product     = swarm.product || {};
        const firstName   = PastWinnersController._escape(draw.winner_first_name || 'A lucky bee');
        const city        = PastWinnersController._escape(draw.winner_city || 'Canada');
        const productName = PastWinnersController._escape(product.name || 'an item');
        const retailValue = product.retail_value ? 'Nt ' + PastWinnersController._escape(String(product.retail_value)) : '';
        const verifyUrl   = draw.random_org_verify_url || '';

        // Format draw date
        let formattedDate = '';
        if (draw.draw_date || draw.completed_at) {
            const dateStr = draw.draw_date || draw.completed_at;
            formattedDate = new Date(dateStr).toLocaleDateString('en-CA', {
                year: 'numeric', month: 'long', day: 'numeric',
            });
        }

        // Product image
        const images    = product.images || [];
        const imageSrc  = images.length > 0 ? PastWinnersController._escape(images[0]) : '';
        const imageHtml = imageSrc
            ? `<img src="${imageSrc}" alt="${productName}" class="winner-img">`
            : '<div class="winner-img winner-img--placeholder"></div>';

        return `
<div class="winner-card">
    ${imageHtml}
    <div class="winner-info">
        <strong class="winner-name">${firstName} from ${city}</strong>
        <p class="winner-item">${productName}</p>
        ${retailValue ? `<p class="winner-value">Retail value: ${retailValue}</p>` : ''}
        ${formattedDate ? `<time class="winner-date">${PastWinnersController._escape(formattedDate)}</time>` : ''}
        ${verifyUrl ? `<a href="${PastWinnersController._escape(verifyUrl)}" target="_blank" rel="noopener" class="verify-link">Verify on Random.org</a>` : ''}
    </div>
</div>`;
    }

    /**
     * Render the "Load more" pagination button.
     * @returns {void}
     */
    _renderLoadMore() {
        const $pagination = $('#winners-pagination');
        $pagination.html('<button id="load-more-btn" class="btn-ghost">Load more winners</button>');

        const self = this;
        $pagination.off('click', '#load-more-btn').on('click', '#load-more-btn', function () {
            self._page++;
            $(this).prop('disabled', true).text('Loading...');
            self.loadWinners(self._page);
        });
    }

    // -------------------------
    // IndexedDB helpers
    // -------------------------

    /**
     * Open (or reuse) the IndexedDB database with store 'winners-cache'.
     * @returns {Promise<IDBDatabase>}
     */
    _openDb() {
        if (this._db) {
            return Promise.resolve(this._db);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('honeycolm-winners', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('winners-cache')) {
                    db.createObjectStore('winners-cache');
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
     * Write the full winners list to IndexedDB under key 'all-winners'.
     * @param {Object[]} winners
     * @returns {Promise<void>}
     */
    async _cacheWinners(winners) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx    = db.transaction('winners-cache', 'readwrite');
                const store = tx.objectStore('winners-cache');
                const req   = store.put(winners, 'all-winners');
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            // Non-critical — silently swallow cache write failures
        }
    }

    /**
     * Read the cached winners list from IndexedDB.
     * Returns null if the store is empty or the read fails.
     * @returns {Promise<Object[]|null>}
     */
    async _readCachedWinners() {
        try {
            const db = await this._openDb();
            return await new Promise((resolve, reject) => {
                const tx    = db.transaction('winners-cache', 'readonly');
                const store = tx.objectStore('winners-cache');
                const req   = store.get('all-winners');
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
