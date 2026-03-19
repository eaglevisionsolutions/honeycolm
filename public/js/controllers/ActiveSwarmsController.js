/**
 * App.Controllers.ActiveSwarmsController
 * Renders the Active Swarms browse page with category/sort filters.
 *
 * - Fetches all active swarms via GET /swarms?region=ca
 * - Applies filters client-side (category, sort)
 * - Renders SwarmCard grid with live count
 * - Caches swarm list in IndexedDB for offline reads
 * - Shows "Showing cached data" badge when rendering from cache
 */

'use strict';

window.App          = window.App          || {};
App.Controllers     = App.Controllers     || {};

App.Controllers.ActiveSwarmsController = class ActiveSwarmsController extends App.Controllers.BaseController {

    constructor() {
        super();
        /** @type {Object[]} Full list of swarms from API / cache */
        this._allSwarms = [];
        /** @type {{ category: string, sort: string }} Active filter state */
        this._activeFilters = { category: 'all', sort: 'newest' };
        /** @type {IDBDatabase|null} */
        this._db = null;
        /** @type {boolean} Whether we are showing cached data */
        this._isOffline = false;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    /**
     * Entry point — renders the page skeleton, filter bar, and loads swarms.
     * @returns {void}
     */
    init() {
        this._renderPageShell();
        this.renderFilterBar();
        this._bindEvents();
        this.loadSwarms();
    }

    // -------------------------
    // Render helpers
    // -------------------------

    /**
     * Inject the page skeleton into #app-root.
     * @returns {void}
     */
    _renderPageShell() {
        const html = `
<section class="active-swarms-page container" aria-label="Active Swarms">
    <h1 class="section-headline mt-3">Active Swarms</h1>
    <div id="filter-bar-container"></div>
    <p class="swarm-count" id="swarm-count"></p>
    <div id="swarm-offline-badge"></div>
    <div class="swarm-grid" id="swarm-grid-browse">
        <div class="page-loading"><span class="spinner"></span> Loading Swarms&hellip;</div>
    </div>
</section>`;

        $('#app-root').html(html);
    }

    /**
     * Render the filter bar with category chips and sort dropdown.
     * Injected into #filter-bar-container.
     * @returns {void}
     */
    renderFilterBar() {
        const categories = [
            { value: 'all',           label: 'All' },
            { value: 'Electronics',   label: 'Electronics' },
            { value: 'Fashion',       label: 'Fashion' },
            { value: 'Gaming',        label: 'Gaming' },
            { value: 'Experiences',   label: 'Experiences' },
            { value: 'Collectibles',  label: 'Collectibles' },
        ];

        const chipsHtml = categories.map((cat) => {
            const active = cat.value === this._activeFilters.category ? ' active' : '';
            return `<button class="chip${active}" data-category="${cat.value}">${cat.label}</button>`;
        }).join('');

        const html = `
<div class="filter-bar">
    <div class="filter-chips">
        ${chipsHtml}
    </div>
    <select class="sort-select" id="sort-select">
        <option value="newest">Newest</option>
        <option value="ending_soon">Ending soon</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
    </select>
</div>`;

        $('#filter-bar-container').html(html);

        // Restore sort selection
        $('#sort-select').val(this._activeFilters.sort);
    }

    // -------------------------
    // Data loading
    // -------------------------

    /**
     * Fetch swarms from the API and fall back to IndexedDB cache on failure.
     * @returns {Promise<void>}
     */
    async loadSwarms() {
        try {
            const response = await App.Services.ApiService.getInstance().get('/swarms?region=ca');
            const swarms   = (response && response.data) ? response.data : [];

            this._allSwarms = swarms;
            this._isOffline = false;
            await this._cacheSwarms(swarms);
            this.applyFilters();
        } catch (err) {
            const cached = await this._readCachedSwarms();
            if (cached && cached.length > 0) {
                this._allSwarms = cached;
                this._isOffline = true;
                this.applyFilters();
            } else {
                this._allSwarms = [];
                this._isOffline = false;
                this.applyFilters();
            }
        }
    }

    // -------------------------
    // Filtering and sorting
    // -------------------------

    /**
     * Apply the active category and sort filters to the full swarm list,
     * then render the resulting cards.
     * @returns {void}
     */
    applyFilters() {
        let filtered = this._allSwarms.slice();

        // Category filter
        const cat = this._activeFilters.category;
        if (cat !== 'all') {
            filtered = filtered.filter((swarm) => {
                const swarmCategory = (swarm.product && swarm.product.category) || swarm.category || '';
                return swarmCategory.toLowerCase() === cat.toLowerCase();
            });
        }

        // Sort
        const sort = this._activeFilters.sort;
        switch (sort) {
            case 'newest':
                filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                break;
            case 'ending_soon':
                filtered.sort((a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0));
                break;
            case 'price_asc':
                filtered.sort((a, b) => (a.comb_price || 0) - (b.comb_price || 0));
                break;
            case 'price_desc':
                filtered.sort((a, b) => (b.comb_price || 0) - (a.comb_price || 0));
                break;
        }

        this._renderSwarmCards(filtered);
    }

    // -------------------------
    // Event handlers
    // -------------------------

    /**
     * Bind click/change events for filter controls.
     * @returns {void}
     */
    _bindEvents() {
        const self = this;

        // Category chip clicks — delegated from #filter-bar-container
        $(document).on('click', '.filter-bar .chip', function (e) {
            self.onCategoryClick(e);
        });

        // Sort dropdown change
        $(document).on('change', '#sort-select', function (e) {
            self.onSortChange(e);
        });
    }

    /**
     * Handle category chip click.
     * Updates active chip state and reapplies filters.
     * @param {Event} e
     * @returns {void}
     */
    onCategoryClick(e) {
        const $chip    = $(e.currentTarget);
        const category = $chip.data('category');

        // Update active chip visual state
        $('.filter-bar .chip').removeClass('active');
        $chip.addClass('active');

        this._activeFilters.category = category;
        this.applyFilters();
    }

    /**
     * Handle sort dropdown change.
     * Updates sort value and reapplies filters.
     * @param {Event} e
     * @returns {void}
     */
    onSortChange(e) {
        this._activeFilters.sort = $(e.currentTarget).val();
        this.applyFilters();
    }

    // -------------------------
    // Private render helpers
    // -------------------------

    /**
     * Render swarm cards into the grid, update count, handle empty state.
     * Calls CountdownTimer.startAll() after cards are in the DOM.
     * @param {Object[]} swarms
     * @returns {void}
     */
    _renderSwarmCards(swarms) {
        const $grid  = $('#swarm-grid-browse');
        const $count = $('#swarm-count');
        const $badge = $('#swarm-offline-badge');

        $grid.empty();
        $badge.empty();

        // Offline badge
        if (this._isOffline) {
            $badge.html('<div class="offline-badge">Showing cached data</div>');
        }

        // Count display
        $count.text(swarms.length + ' Swarm' + (swarms.length !== 1 ? 's' : '') + ' live now');

        // Empty state
        if (swarms.length === 0) {
            $grid.html('<p class="empty-state">No Swarms match your filters right now. Check back soon.</p>');
            return;
        }

        // Render cards
        swarms.forEach((swarm) => {
            $grid.append(App.Components.SwarmCard.render(swarm));
        });

        // Start countdown timers after cards are in the DOM
        App.Components.CountdownTimer.startAll();
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
     * Write the swarm list to IndexedDB under key 'browse-list'.
     * @param {Object[]} swarms
     * @returns {Promise<void>}
     */
    async _cacheSwarms(swarms) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx    = db.transaction('swarms-cache', 'readwrite');
                const store = tx.objectStore('swarms-cache');
                const req   = store.put(swarms, 'browse-list');
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
                const req   = store.get('browse-list');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            return null;
        }
    }
};
