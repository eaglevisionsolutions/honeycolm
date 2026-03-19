/**
 * App.Admin.Controllers.SwarmManagementController
 * Admin swarm management: list, create (3-step), and detail views.
 *
 * Routes (URL-based):
 *  /admin/swarms           -> renderList()
 *  /admin/swarms/create    -> renderCreateStep1()  (or step=2, step=3)
 *  /admin/swarms/{id}      -> renderDetail(id)
 *
 * Uses admin JWT via App.Admin.AuthService.getToken().
 * Admin panel has no service worker -- no offline queue needed.
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};

App.Admin.Controllers.SwarmManagementController = class SwarmManagementController {

    constructor() {
        /** @type {Array} All swarms loaded from API for client-side filtering */
        this._allSwarms = [];

        /** @type {string} Current status filter tab */
        this._activeFilter = 'all';

        /** @type {string} Current search query */
        this._searchQuery = '';

        /** @type {number} Current page for swarm list pagination */
        this._listPage = 1;

        /** @type {number} Items per page for swarm list */
        this._listPerPage = 20;

        /** @type {Object|null} Draft swarm state for multi-step create */
        this._draftSwarm = null;

        /** @type {number|null} Debounce timer for product search */
        this._productSearchTimer = null;

        /** @type {number} Margin warning threshold fetched from settings */
        this._marginWarningThreshold = 0;

        /** @type {number} Current page for comb holders pagination */
        this._holdersPage = 1;

        /** @type {number} Comb holders per page */
        this._holdersPerPage = 20;
    }

    // =========================================
    // Public API
    // =========================================

    /**
     * Initialise the controller. Reads the URL and renders the correct view.
     */
    async init() {
        await this._fetchSettings();
        this._route();
    }

    // =========================================
    // Routing
    // =========================================

    /**
     * Read the current URL and render the matching view.
     */
    _route() {
        const path   = window.location.pathname;
        const params = new URLSearchParams(window.location.search);

        if (path.match(/\/admin\/swarms\/create\/?$/)) {
            const step = parseInt(params.get('step'), 10) || 1;
            if (step === 3) {
                this.renderCreateStep3();
            } else if (step === 2) {
                this.renderCreateStep2();
            } else {
                this.renderCreateStep1();
            }
        } else if (path.match(/\/admin\/swarms\/(\d+)\/?$/)) {
            const id = path.match(/\/admin\/swarms\/(\d+)\/?$/)[1];
            this.renderDetail(id);
        } else {
            this.renderList();
        }
    }

    // =========================================
    // Settings fetch
    // =========================================

    /**
     * Fetch platform settings to get margin_warning_threshold.
     * Falls back to 0 (no warning) if fetch fails.
     */
    async _fetchSettings() {
        try {
            const response = await fetch('/api/v1/admin/settings', {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (body.success && body.data) {
                this._marginWarningThreshold = parseFloat(body.data.margin_warning_threshold) || 0;
            }
        } catch (_) {
            // Non-fatal -- margin warning simply will not trigger
        }
    }

    // =========================================
    // RENDER: Swarm List
    // =========================================

    /**
     * Renders the swarm list page with status filter tabs, search, and paginated table.
     */
    async renderList() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = `
            <div class="swarm-list-page">
                <div class="dashboard-header">
                    <div>
                        <h1 class="dashboard-title">Swarm Management</h1>
                        <p class="swarm-list-subtitle">Manage collective honey distribution and active purchase pools.</p>
                    </div>
                    <a href="/admin/swarms/create" class="btn-admin-primary swarm-create-btn">+ Create new Swarm</a>
                </div>

                <div class="swarm-filter-tabs" id="swarm-filter-tabs" role="tablist" aria-label="Filter swarms by status">
                </div>

                <div class="swarm-search-row">
                    <input type="text" id="swarm-search" class="swarm-search-input" placeholder="Search by product name..." aria-label="Search swarms">
                </div>

                <div id="swarm-list-content">
                    <p class="dashboard-loading">Loading...</p>
                </div>
            </div>`;

        this._renderFilterTabs();
        this._bindListEvents();
        await this._loadSwarms();
    }

    /**
     * Render the status filter tab bar.
     */
    _renderFilterTabs() {
        const container = document.getElementById('swarm-filter-tabs');
        if (!container) return;

        const tabs = [
            { key: 'all',           label: 'All' },
            { key: 'draft',         label: 'Draft' },
            { key: 'active',        label: 'Active' },
            { key: 'filling_fast',  label: 'Filling fast' },
            { key: 'full',          label: 'Full' },
            { key: 'draw_complete', label: 'Draw complete' },
            { key: 'shipped',       label: 'Shipped' },
            { key: 'expired',       label: 'Expired' },
            { key: 'cancelled',     label: 'Cancelled' }
        ];

        container.innerHTML = tabs.map((t) => {
            const active = t.key === this._activeFilter ? ' active' : '';
            return `<button class="filter-tab${active}" data-filter="${t.key}" role="tab" aria-selected="${t.key === this._activeFilter}">${this._escHtml(t.label)}</button>`;
        }).join('');
    }

    /**
     * Bind list page events: search input, filter tabs.
     */
    _bindListEvents() {
        const searchInput = document.getElementById('swarm-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this._searchQuery = e.target.value.trim().toLowerCase();
                this._listPage = 1;
                this._renderSwarmTable();
            });
        }

        const tabContainer = document.getElementById('swarm-filter-tabs');
        if (tabContainer) {
            tabContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-tab');
                if (!btn) return;

                this._activeFilter = btn.getAttribute('data-filter');
                this._listPage = 1;

                tabContainer.querySelectorAll('.filter-tab').forEach((t) => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');

                this._renderSwarmTable();
            });
        }
    }

    /**
     * Fetch all swarms from the API.
     */
    async _loadSwarms() {
        try {
            const response = await fetch('/api/v1/admin/swarms', {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to load swarms.');
            }
            this._allSwarms = body.data.swarms || body.data || [];
        } catch (err) {
            const el = document.getElementById('swarm-list-content');
            if (el) {
                el.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(err.message)}</div>`;
            }
            return;
        }
        this._renderSwarmTable();
    }

    /**
     * Filter and paginate swarms, then render the table.
     */
    _renderSwarmTable() {
        const el = document.getElementById('swarm-list-content');
        if (!el) return;

        let filtered = this._allSwarms;

        // Status filter
        if (this._activeFilter !== 'all') {
            filtered = filtered.filter((s) => s.status === this._activeFilter);
        }

        // Search filter (client-side by product name)
        if (this._searchQuery) {
            filtered = filtered.filter((s) => {
                const name = (s.product_name || s.name || '').toLowerCase();
                return name.includes(this._searchQuery);
            });
        }

        const total     = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / this._listPerPage));
        if (this._listPage > totalPages) this._listPage = totalPages;
        const start     = (this._listPage - 1) * this._listPerPage;
        const pageItems = filtered.slice(start, start + this._listPerPage);

        if (total === 0) {
            el.innerHTML = '<p class="dashboard-empty">No Swarms match your filters.</p>';
            return;
        }

        const rows = pageItems.map((swarm) => {
            const id          = swarm.id || '';
            const productName = this._escHtml(swarm.product_name || swarm.name || 'Unnamed');
            const sku         = this._escHtml(swarm.sku || '');
            const imgSrc      = swarm.product_image || swarm.image || '';
            const combPrice   = swarm.comb_price !== undefined ? 'Nt ' + this._formatDecimal(swarm.comb_price) : '--';
            const combCount   = swarm.comb_count || swarm.total_combs || 0;
            const combsSold   = swarm.combs_sold || 0;
            const fillPct     = combCount > 0 ? Math.min(100, Math.round((combsSold / combCount) * 100)) : 0;
            const deadline    = swarm.deadline ? this._formatDate(swarm.deadline) : '--';
            const status      = swarm.status || 'active';
            const badgeHtml   = this._statusBadge(status);
            const swarmType   = swarm.swarm_type || swarm.type || 'standard';
            const typeBadge   = swarmType === 'queen'
                ? '<span class="status-badge badge--filling-fast">Queen</span>'
                : '<span class="status-badge badge--draft">Standard</span>';
            const marginPct   = swarm.margin_pct !== undefined ? swarm.margin_pct + '%' : '--';
            const href        = '/admin/swarms/' + id;
            const imgHtml     = imgSrc
                ? `<img src="${this._escHtml(imgSrc)}" alt="" class="swarm-list-thumb">`
                : '<div class="swarm-list-thumb-placeholder"></div>';

            const deadlineExtra = this._deadlineExtra(swarm);

            return `<tr>
                <td>
                    <div class="swarm-list-product">
                        ${imgHtml}
                        <div>
                            <a class="swarm-link" href="${href}">${productName}</a>
                            ${sku ? `<div class="swarm-list-sku">${sku}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${typeBadge}</td>
                <td>${badgeHtml}</td>
                <td>
                    <div class="swarm-list-fill">
                        <span class="swarm-list-fill-text">${this._formatNumber(combsSold)}/${this._formatNumber(combCount)} Sold</span>
                        <div class="mini-progress" title="${fillPct}% filled">
                            <div class="mini-progress-fill" style="width:${fillPct}%"></div>
                        </div>
                        <span class="mini-progress-label">${fillPct}%</span>
                    </div>
                </td>
                <td>
                    <div>${deadline}</div>
                    ${deadlineExtra ? `<div class="swarm-list-deadline-extra">${deadlineExtra}</div>` : ''}
                </td>
                <td>${marginPct}</td>
                <td>
                    <a href="${href}" class="btn-admin-ghost swarm-action-btn" title="View detail">View</a>
                </td>
            </tr>`;
        }).join('');

        const paginationHtml = this._buildPagination(this._listPage, totalPages, total, 'swarm-list');

        el.innerHTML = `
            <div class="dashboard-swarms-wrap">
                <table class="admin-table" aria-label="Swarms">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>Deadline</th>
                            <th>Margin %</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${paginationHtml}`;

        this._bindPagination('swarm-list', totalPages, (page) => {
            this._listPage = page;
            this._renderSwarmTable();
        });
    }

    // =========================================
    // RENDER: Create Step 1 -- Product Picker
    // =========================================

    /**
     * Renders the product picker step of the create flow.
     */
    renderCreateStep1() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        if (!this._draftSwarm) {
            this._draftSwarm = { product: null };
        }

        root.innerHTML = `
            <div class="swarm-create-page">
                <nav class="swarm-breadcrumb" aria-label="Breadcrumb">
                    <a href="/admin/swarms">Swarms</a> <span class="breadcrumb-sep">&rsaquo;</span> <span>New Swarm</span>
                </nav>
                <h1 class="dashboard-title">Create New Swarm</h1>
                <p class="swarm-create-subtitle">Select the primary product to anchor this Swarm's value proposition.</p>

                ${this._stepProgress(1)}

                <div class="product-search-row">
                    <input type="text" id="product-search" class="swarm-search-input" placeholder="Search product name, category, or SKU..." aria-label="Search products">
                    <span id="product-count" class="product-count"></span>
                </div>

                <div class="product-picker-grid" id="product-picker-grid">
                    <div class="product-card product-card--add" id="add-new-product-card">
                        <div class="product-card-add-icon">+</div>
                        <div class="product-card-add-title">Add new product</div>
                        <div class="product-card-add-desc">Can't find what you're looking for? Create a new catalog entry.</div>
                    </div>
                </div>

                <div class="swarm-create-footer">
                    <a href="/admin/swarms" class="btn-admin-ghost">Cancel &amp; exit</a>
                    <div class="swarm-create-footer-right">
                        <span id="product-selected-label" class="product-selected-label" style="display:none;">1 product selected</span>
                        <button class="btn-admin-primary" id="step1-next" disabled>Next: Configuration &rarr;</button>
                    </div>
                </div>
            </div>`;

        this._bindStep1Events();
        this._loadProducts('');
    }

    /**
     * Bind step 1 events: product search with debounce, product card selection, next button.
     */
    _bindStep1Events() {
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.trim();
                clearTimeout(this._productSearchTimer);
                this._productSearchTimer = setTimeout(() => {
                    this._loadProducts(q);
                }, 300);
            });
        }

        const addCard = document.getElementById('add-new-product-card');
        if (addCard) {
            addCard.addEventListener('click', () => {
                window.location.href = '/admin/catalog/new';
            });
        }

        const nextBtn = document.getElementById('step1-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this._draftSwarm && this._draftSwarm.product) {
                    window.history.pushState({}, '', '/admin/swarms/create?step=2');
                    this.renderCreateStep2();
                }
            });
        }
    }

    /**
     * Fetch products from the catalog API and render them as cards.
     * @param {string} query - Search query
     */
    async _loadProducts(query) {
        const grid = document.getElementById('product-picker-grid');
        if (!grid) return;

        let url = '/api/v1/admin/products';
        if (query) {
            url += '?search=' + encodeURIComponent(query);
        }

        let products = [];
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (body.success && body.data) {
                products = body.data.products || body.data || [];
            }
        } catch (_) {
            // Silently fail -- grid remains empty
        }

        const countEl = document.getElementById('product-count');
        if (countEl) {
            countEl.textContent = products.length + ' product' + (products.length !== 1 ? 's' : '') + ' found';
        }

        // Keep the "Add new" card, append product cards after it
        const addCard = document.getElementById('add-new-product-card');
        const addCardHtml = addCard ? addCard.outerHTML : '';

        const selectedId = this._draftSwarm && this._draftSwarm.product ? this._draftSwarm.product.id : null;

        const cards = products.map((p) => {
            const selected = p.id === selectedId ? ' selected' : '';
            const imgSrc   = (p.images && p.images.length > 0) ? p.images[0] : (p.image || '');
            const category = this._escHtml(p.category || '');
            const name     = this._escHtml(p.name || '');
            const sku      = this._escHtml(p.sku || '');
            const retail   = p.retail_value !== undefined ? '$' + this._formatDecimal(p.retail_value) : '--';
            const timesUsed = p.times_used !== undefined ? p.times_used : 0;
            const btnLabel = selected ? 'SELECTED' : 'SELECT';
            const btnClass = selected ? 'btn-admin-primary product-select-btn product-select-btn--selected' : 'btn-admin-ghost product-select-btn';

            return `<div class="product-card${selected}" data-product-id="${p.id}" data-product='${this._escAttr(JSON.stringify(p))}'>
                ${category ? `<span class="product-card-category">${category}</span>` : ''}
                ${imgSrc ? `<img src="${this._escHtml(imgSrc)}" alt="${name}" class="product-card-img">` : '<div class="product-card-img-placeholder"></div>'}
                <div class="product-card-name">${name}</div>
                ${sku ? `<div class="product-card-sku">SKU: ${sku}</div>` : ''}
                <div class="product-card-footer">
                    <div>
                        <div class="product-card-retail-label">RETAIL VALUE</div>
                        <div class="product-card-retail">${retail}</div>
                    </div>
                    <button class="${btnClass}">${btnLabel}</button>
                </div>
            </div>`;
        }).join('');

        grid.innerHTML = addCardHtml + cards;

        // Re-bind the add card click
        const newAddCard = document.getElementById('add-new-product-card');
        if (newAddCard) {
            newAddCard.addEventListener('click', () => {
                window.location.href = '/admin/catalog/new';
            });
        }

        // Bind product card clicks
        grid.querySelectorAll('.product-card[data-product-id]').forEach((card) => {
            card.addEventListener('click', () => {
                this._selectProduct(card);
            });
        });
    }

    /**
     * Handle product card selection.
     * @param {HTMLElement} card
     */
    _selectProduct(card) {
        const grid = document.getElementById('product-picker-grid');
        if (!grid) return;

        // Deselect all
        grid.querySelectorAll('.product-card[data-product-id]').forEach((c) => {
            c.classList.remove('selected');
            const btn = c.querySelector('.product-select-btn');
            if (btn) {
                btn.textContent = 'SELECT';
                btn.classList.remove('btn-admin-primary', 'product-select-btn--selected');
                btn.classList.add('btn-admin-ghost');
            }
        });

        // Select this card
        card.classList.add('selected');
        const btn = card.querySelector('.product-select-btn');
        if (btn) {
            btn.textContent = 'SELECTED';
            btn.classList.remove('btn-admin-ghost');
            btn.classList.add('btn-admin-primary', 'product-select-btn--selected');
        }

        // Store product data
        try {
            this._draftSwarm.product = JSON.parse(card.getAttribute('data-product'));
        } catch (_) {
            this._draftSwarm.product = { id: card.getAttribute('data-product-id') };
        }

        // Enable Next button
        const nextBtn = document.getElementById('step1-next');
        if (nextBtn) {
            nextBtn.disabled = false;
        }

        // Show selected label
        const label = document.getElementById('product-selected-label');
        if (label) {
            label.style.display = '';
        }
    }

    // =========================================
    // RENDER: Create Step 2 -- Swarm Parameters
    // =========================================

    /**
     * Renders the Swarm parameters form with auto-calculated margin.
     */
    renderCreateStep2() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        if (!this._draftSwarm || !this._draftSwarm.product) {
            window.history.pushState({}, '', '/admin/swarms/create');
            this.renderCreateStep1();
            return;
        }

        const product = this._draftSwarm.product;
        const imgSrc  = (product.images && product.images.length > 0) ? product.images[0] : (product.image || '');
        const retail   = product.retail_value !== undefined ? this._formatDecimal(product.retail_value) : '0.00';

        // Pre-fill from draft if going back
        const draft = this._draftSwarm;
        const combCount  = draft.comb_count  || '';
        const combPrice  = draft.comb_price  || '';
        const region     = draft.region      || '';
        const deadline   = draft.deadline    || '';
        const swarmType  = draft.swarm_type  || 'standard';
        const combLimit  = draft.comb_limit  || '';

        root.innerHTML = `
            <div class="swarm-create-page">
                <nav class="swarm-breadcrumb" aria-label="Breadcrumb">
                    <a href="/admin/swarms">Swarms</a> <span class="breadcrumb-sep">&rsaquo;</span> <span>New Swarm</span>
                </nav>
                <h1 class="dashboard-title">Swarm Parameters</h1>
                <p class="swarm-create-subtitle">Define the core economics and distribution for your new Swarm.</p>

                ${this._stepProgress(2)}

                <div class="swarm-step2-layout">
                    <div class="swarm-step2-form">
                        <div class="swarm-product-summary">
                            ${imgSrc ? `<img src="${this._escHtml(imgSrc)}" alt="" class="swarm-product-summary-img">` : ''}
                            <div>
                                <div class="swarm-product-summary-name">${this._escHtml(product.name || '')}</div>
                                <div class="swarm-product-summary-retail">Retail value: $${this._escHtml(retail)}</div>
                            </div>
                        </div>

                        <div class="swarm-params-card">
                            <div class="swarm-params-row">
                                <div class="form-group">
                                    <label for="param-region">Target region</label>
                                    <select id="param-region" class="form-select">
                                        <option value="">Select region</option>
                                        <option value="canada"${region === 'canada' ? ' selected' : ''}>Canada</option>
                                        <option value="united_states"${region === 'united_states' ? ' selected' : ''}>United States</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Swarm type</label>
                                    <div class="swarm-type-toggle">
                                        <button type="button" class="swarm-type-btn${swarmType === 'standard' ? ' active' : ''}" data-type="standard">Standard</button>
                                        <button type="button" class="swarm-type-btn${swarmType === 'queen' ? ' active' : ''}" data-type="queen">Queen</button>
                                    </div>
                                </div>
                            </div>

                            <div class="swarm-params-row">
                                <div class="form-group">
                                    <label for="param-comb-count">Total Comb count</label>
                                    <div class="input-with-suffix">
                                        <input type="number" id="param-comb-count" min="2" step="1" value="${this._escHtml(String(combCount))}" placeholder="e.g. 500">
                                        <span class="input-suffix">units</span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="param-comb-price">Comb price (Nectar)</label>
                                    <div class="input-with-prefix">
                                        <span class="input-prefix">Nt</span>
                                        <input type="number" id="param-comb-price" min="0.01" step="0.01" value="${this._escHtml(String(combPrice))}" placeholder="e.g. 12.50">
                                    </div>
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="param-comb-limit">Per-member Comb limit <span class="form-optional">(optional)</span></label>
                                <input type="number" id="param-comb-limit" min="1" step="1" value="${this._escHtml(String(combLimit))}" placeholder="Leave blank for no limit">
                            </div>

                            <div class="form-group">
                                <label for="param-deadline">Swarm deadline</label>
                                <input type="datetime-local" id="param-deadline" value="${this._escHtml(deadline)}">
                            </div>
                        </div>
                    </div>

                    <div class="swarm-step2-sidebar">
                        <div class="margin-calc" id="margin-calc">
                            <div class="margin-calc-header">FINANCIAL SUMMARY</div>
                            <div class="margin-calc-main">
                                <div class="margin-calc-label">Total Pool Value</div>
                                <div class="margin-calc-pool" id="calc-pool-value">Nt 0</div>
                            </div>
                            <div class="margin-calc-row">
                                <div>
                                    <div class="margin-calc-label">Item base cost</div>
                                    <div class="margin-calc-value" id="calc-retail">Nt ${this._escHtml(this._formatDecimal(product.retail_value || 0))}</div>
                                </div>
                                <div>
                                    <div class="margin-calc-label">Gross Margin (Nt)</div>
                                    <div class="margin-calc-value margin-calc-margin" id="calc-gross-margin">Nt 0</div>
                                </div>
                            </div>
                            <div class="margin-calc-bottom">
                                <div class="margin-calc-bottom-row">
                                    <span>Margin percentage</span>
                                    <span class="margin-calc-pct" id="calc-margin-pct">0%</span>
                                </div>
                            </div>
                        </div>

                        <div class="margin-warning" id="margin-warning" style="display:none;" role="alert">
                            <strong>Low margin warning</strong>
                            <p id="margin-warning-text">The calculated margin is below the recommended threshold.</p>
                        </div>

                        <button class="btn-admin-primary swarm-step2-next" id="step2-next">Review Swarm Configuration &rarr;</button>
                        <button class="btn-admin-ghost swarm-step2-draft" id="step2-save-draft">Save Draft</button>
                    </div>
                </div>

                <div class="swarm-create-footer">
                    <button class="btn-admin-ghost" id="step2-back">&larr; Back</button>
                </div>
            </div>`;

        this._bindStep2Events();
        this._recalculateMargin();
    }

    /**
     * Bind step 2 events: inputs, type toggle, navigation.
     */
    _bindStep2Events() {
        const combCountInput = document.getElementById('param-comb-count');
        const combPriceInput = document.getElementById('param-comb-price');

        // Margin recalculation fires on every keyup and change
        const recalc = () => this._recalculateMargin();
        if (combCountInput) {
            combCountInput.addEventListener('keyup', recalc);
            combCountInput.addEventListener('change', recalc);
        }
        if (combPriceInput) {
            combPriceInput.addEventListener('keyup', recalc);
            combPriceInput.addEventListener('change', recalc);
        }

        // Swarm type toggle
        document.querySelectorAll('.swarm-type-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.swarm-type-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Back button
        const backBtn = document.getElementById('step2-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this._collectStep2Data();
                window.history.pushState({}, '', '/admin/swarms/create');
                this.renderCreateStep1();
            });
        }

        // Next button
        const nextBtn = document.getElementById('step2-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this._validateStep2()) {
                    this._collectStep2Data();
                    window.history.pushState({}, '', '/admin/swarms/create?step=3');
                    this.renderCreateStep3();
                }
            });
        }

        // Save draft button
        const draftBtn = document.getElementById('step2-save-draft');
        if (draftBtn) {
            draftBtn.addEventListener('click', async () => {
                if (this._validateStep2()) {
                    this._collectStep2Data();
                    await this._submitSwarm('draft');
                }
            });
        }
    }

    /**
     * Recalculate margin values and update the financial summary display.
     * Fires on every keyup/change, not just blur.
     */
    _recalculateMargin() {
        const combCountInput = document.getElementById('param-comb-count');
        const combPriceInput = document.getElementById('param-comb-price');
        if (!combCountInput || !combPriceInput) return;

        const combCount   = parseFloat(combCountInput.value) || 0;
        const combPrice   = parseFloat(combPriceInput.value) || 0;
        const retailValue = (this._draftSwarm && this._draftSwarm.product)
            ? parseFloat(this._draftSwarm.product.retail_value) || 0
            : 0;

        const poolValue   = combCount * combPrice;
        const grossMargin = poolValue - retailValue;
        const marginPct   = poolValue > 0 ? ((grossMargin / poolValue) * 100) : 0;

        const poolEl      = document.getElementById('calc-pool-value');
        const marginEl    = document.getElementById('calc-gross-margin');
        const pctEl       = document.getElementById('calc-margin-pct');
        const warningEl   = document.getElementById('margin-warning');
        const warningText = document.getElementById('margin-warning-text');

        if (poolEl)    poolEl.textContent    = 'Nt ' + this._formatNumber(Math.round(poolValue));
        if (marginEl)  marginEl.textContent  = (grossMargin >= 0 ? '+ Nt ' : '- Nt ') + this._formatNumber(Math.abs(Math.round(grossMargin)));
        if (pctEl)     pctEl.textContent     = marginPct.toFixed(1) + '%';

        // Colour margin percentage
        if (pctEl) {
            if (marginPct < 0) {
                pctEl.style.color = '#B71C1C';
            } else if (this._marginWarningThreshold > 0 && marginPct < this._marginWarningThreshold) {
                pctEl.style.color = '#C47A1E';
            } else {
                pctEl.style.color = '#2E7D32';
            }
        }

        // Margin warning
        if (warningEl) {
            if (this._marginWarningThreshold > 0 && poolValue > 0 && marginPct < this._marginWarningThreshold) {
                warningEl.style.display = '';
                if (warningText) {
                    warningText.textContent = 'The calculated margin (' + marginPct.toFixed(1) + '%) is below your organization\'s recommended threshold of ' + this._marginWarningThreshold + '%. This Swarm may be less profitable than standard hive goals.';
                }
            } else {
                warningEl.style.display = 'none';
            }
        }
    }

    /**
     * Collect step 2 form data into this._draftSwarm.
     */
    _collectStep2Data() {
        if (!this._draftSwarm) return;

        const combCount = document.getElementById('param-comb-count');
        const combPrice = document.getElementById('param-comb-price');
        const region    = document.getElementById('param-region');
        const deadline  = document.getElementById('param-deadline');
        const combLimit = document.getElementById('param-comb-limit');
        const activeType = document.querySelector('.swarm-type-btn.active');

        this._draftSwarm.comb_count = combCount ? parseInt(combCount.value, 10) || 0 : 0;
        this._draftSwarm.comb_price = combPrice ? parseFloat(combPrice.value) || 0 : 0;
        this._draftSwarm.region     = region ? region.value : '';
        this._draftSwarm.deadline   = deadline ? deadline.value : '';
        this._draftSwarm.swarm_type = activeType ? activeType.getAttribute('data-type') : 'standard';
        this._draftSwarm.comb_limit = combLimit && combLimit.value ? parseInt(combLimit.value, 10) : null;

        // Calculated fields
        const poolValue   = this._draftSwarm.comb_count * this._draftSwarm.comb_price;
        const retailValue = this._draftSwarm.product ? (parseFloat(this._draftSwarm.product.retail_value) || 0) : 0;
        this._draftSwarm.pool_value   = poolValue;
        this._draftSwarm.gross_margin = poolValue - retailValue;
        this._draftSwarm.margin_pct   = poolValue > 0 ? ((poolValue - retailValue) / poolValue * 100) : 0;
    }

    /**
     * Validate step 2 form fields.
     * @returns {boolean}
     */
    _validateStep2() {
        const errors = [];
        const combCount = document.getElementById('param-comb-count');
        const combPrice = document.getElementById('param-comb-price');
        const region    = document.getElementById('param-region');
        const deadline  = document.getElementById('param-deadline');

        if (!combCount || !combCount.value || parseInt(combCount.value, 10) < 2) {
            errors.push('Comb count must be at least 2.');
        }
        if (!combPrice || !combPrice.value || parseFloat(combPrice.value) < 0.01) {
            errors.push('Comb price must be at least Nt 0.01.');
        }
        if (!region || !region.value) {
            errors.push('Please select a region.');
        }
        if (!deadline || !deadline.value) {
            errors.push('Please set a deadline.');
        }

        if (errors.length > 0) {
            alert(errors.join('\n'));
            return false;
        }
        return true;
    }

    // =========================================
    // RENDER: Create Step 3 -- Review & Publish
    // =========================================

    /**
     * Renders the review summary with Save as Draft and Publish Live buttons.
     */
    renderCreateStep3() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        if (!this._draftSwarm || !this._draftSwarm.product || !this._draftSwarm.comb_count) {
            window.history.pushState({}, '', '/admin/swarms/create');
            this.renderCreateStep1();
            return;
        }

        const draft   = this._draftSwarm;
        const product = draft.product;
        const imgSrc  = (product.images && product.images.length > 0) ? product.images[0] : (product.image || '');
        const retail  = product.retail_value !== undefined ? '$' + this._formatDecimal(product.retail_value) : '--';
        const regionLabel = draft.region === 'canada' ? 'Canada' : (draft.region === 'united_states' ? 'United States' : draft.region || '--');
        const typeLabel   = draft.swarm_type === 'queen' ? 'Queen Swarm' : 'Standard';
        const poolValue   = this._formatNumber(Math.round(draft.pool_value || 0));
        const marginPct   = draft.margin_pct !== undefined ? draft.margin_pct.toFixed(1) + '%' : '--';
        const grossMargin = draft.gross_margin !== undefined ? this._formatNumber(Math.abs(Math.round(draft.gross_margin))) : '--';
        const deadlineFormatted = draft.deadline ? this._formatDate(draft.deadline) : '--';
        const combLimitLabel = draft.comb_limit ? draft.comb_limit + ' per member' : 'No limit';

        const showMarginWarning = this._marginWarningThreshold > 0 && draft.margin_pct < this._marginWarningThreshold;

        root.innerHTML = `
            <div class="swarm-create-page">
                <nav class="swarm-breadcrumb" aria-label="Breadcrumb">
                    <a href="/admin/swarms">Swarms</a> <span class="breadcrumb-sep">&rsaquo;</span> <span>New Swarm</span>
                </nav>
                <h1 class="dashboard-title">Create New Swarm</h1>
                <p class="swarm-create-subtitle">Finalize your collective purchase parameters and publish the hive for members to join.</p>

                ${this._stepProgress(3)}

                <div class="swarm-step3-layout">
                    <div class="swarm-step3-main">
                        <div class="swarm-review-section">
                            <div class="swarm-review-section-header">
                                <h2 class="swarm-review-section-title">Product info</h2>
                                <button class="btn-admin-ghost swarm-review-edit" id="edit-step1">Edit</button>
                            </div>
                            <div class="swarm-review-product">
                                ${imgSrc ? `<img src="${this._escHtml(imgSrc)}" alt="" class="swarm-review-product-img">` : ''}
                                <div>
                                    ${product.category ? `<div class="swarm-review-product-category">${this._escHtml(product.category)}</div>` : ''}
                                    <div class="swarm-review-product-name">${this._escHtml(product.name || '')}</div>
                                    ${product.description ? `<div class="swarm-review-product-desc">${this._escHtml(product.description)}</div>` : ''}
                                    <div class="swarm-review-product-values">
                                        <div><span class="swarm-review-label">RETAIL VALUE</span><br>${retail}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="swarm-review-section">
                            <div class="swarm-review-section-header">
                                <h2 class="swarm-review-section-title">Swarm parameters</h2>
                                <button class="btn-admin-ghost swarm-review-edit" id="edit-step2">Edit</button>
                            </div>
                            <table class="swarm-review-table">
                                <tbody>
                                    <tr><td>Comb count (slots)</td><td>${this._formatNumber(draft.comb_count)} Slots</td></tr>
                                    <tr><td>Comb price (each)</td><td>Nt ${this._formatDecimal(draft.comb_price)}</td></tr>
                                    <tr><td>Total pool target</td><td>Nt ${poolValue}</td></tr>
                                    <tr><td>Swarm margin</td><td>${marginPct}</td></tr>
                                    <tr><td>Active region</td><td>${this._escHtml(regionLabel)}</td></tr>
                                    <tr><td>Fulfillment deadline</td><td>${deadlineFormatted}</td></tr>
                                    <tr><td>Swarm type</td><td>${this._escHtml(typeLabel)}</td></tr>
                                    <tr><td>Comb limit</td><td>${this._escHtml(combLimitLabel)}</td></tr>
                                </tbody>
                            </table>
                        </div>

                        ${showMarginWarning ? `
                        <div class="margin-warning" role="alert">
                            <strong>Low margin warning</strong>
                            <p>The calculated margin (${draft.margin_pct.toFixed(1)}%) is below your organization's recommended threshold of ${this._marginWarningThreshold}%. This Swarm may be less profitable than standard hive goals.</p>
                        </div>` : ''}
                    </div>

                    <div class="swarm-step3-sidebar">
                        <button class="btn-admin-primary swarm-publish-btn" id="step3-publish">Publish live Swarm</button>
                        <button class="btn-admin-ghost swarm-draft-btn" id="step3-draft">Save as draft</button>
                        <p class="swarm-publish-note">By publishing, this Swarm will immediately appear on the member marketplace.</p>
                    </div>
                </div>

                <div class="swarm-create-footer">
                    <button class="btn-admin-ghost" id="step3-back">&larr; Back</button>
                </div>
            </div>`;

        this._bindStep3Events();
    }

    /**
     * Bind step 3 events: edit links, back, publish, draft.
     */
    _bindStep3Events() {
        const editStep1 = document.getElementById('edit-step1');
        if (editStep1) {
            editStep1.addEventListener('click', () => {
                window.history.pushState({}, '', '/admin/swarms/create');
                this.renderCreateStep1();
            });
        }

        const editStep2 = document.getElementById('edit-step2');
        if (editStep2) {
            editStep2.addEventListener('click', () => {
                window.history.pushState({}, '', '/admin/swarms/create?step=2');
                this.renderCreateStep2();
            });
        }

        const backBtn = document.getElementById('step3-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.pushState({}, '', '/admin/swarms/create?step=2');
                this.renderCreateStep2();
            });
        }

        const publishBtn = document.getElementById('step3-publish');
        if (publishBtn) {
            publishBtn.addEventListener('click', async () => {
                publishBtn.disabled = true;
                publishBtn.textContent = 'Publishing...';
                await this._submitSwarm('active');
            });
        }

        const draftBtn = document.getElementById('step3-draft');
        if (draftBtn) {
            draftBtn.addEventListener('click', async () => {
                draftBtn.disabled = true;
                draftBtn.textContent = 'Saving...';
                await this._submitSwarm('draft');
            });
        }
    }

    /**
     * Submit the swarm to the API.
     * @param {string} status - 'draft' or 'active'
     */
    async _submitSwarm(status) {
        const draft = this._draftSwarm;
        if (!draft || !draft.product) return;

        const payload = {
            product_id: draft.product.id,
            comb_count: draft.comb_count,
            comb_price: draft.comb_price,
            region:     draft.region,
            deadline:   draft.deadline,
            swarm_type: draft.swarm_type,
            comb_limit: draft.comb_limit,
            status:     status
        };

        try {
            const response = await fetch('/api/v1/admin/swarms', {
                method: 'POST',
                headers: {
                    ...this._authHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to create Swarm.');
            }

            const newId = body.data && body.data.id ? body.data.id : null;

            this._draftSwarm = null;

            if (status === 'active' && newId) {
                window.location.href = '/admin/swarms/' + newId;
            } else {
                window.location.href = '/admin/swarms';
            }
        } catch (err) {
            alert(err.message);
            // Re-enable buttons
            const publishBtn = document.getElementById('step3-publish');
            const draftBtn   = document.getElementById('step3-draft');
            const draftBtn2  = document.getElementById('step2-save-draft');
            if (publishBtn) { publishBtn.disabled = false; publishBtn.textContent = 'Publish live Swarm'; }
            if (draftBtn)   { draftBtn.disabled = false; draftBtn.textContent = 'Save as draft'; }
            if (draftBtn2)  { draftBtn2.disabled = false; draftBtn2.textContent = 'Save Draft'; }
        }
    }

    // =========================================
    // RENDER: Swarm Detail
    // =========================================

    /**
     * Renders the admin detail view for a single swarm.
     * @param {string|number} id
     */
    async renderDetail(id) {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = '<p class="dashboard-loading">Loading Swarm details...</p>';

        let swarm;
        try {
            const response = await fetch('/api/v1/admin/swarms/' + encodeURIComponent(id), {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to load Swarm.');
            }
            swarm = body.data;
        } catch (err) {
            root.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(err.message)}</div>`;
            return;
        }

        const productName = this._escHtml(swarm.product_name || swarm.name || 'Unnamed Swarm');
        const imgSrc      = swarm.product_image || swarm.image || '';
        const retailValue = swarm.retail_value !== undefined ? 'Nt ' + this._formatNumber(Math.round(swarm.retail_value)) : '--';
        const status      = swarm.status || 'active';
        const badgeHtml   = this._statusBadge(status);
        const combCount   = swarm.comb_count || swarm.total_combs || 0;
        const combsSold   = swarm.combs_sold || 0;
        const remaining   = Math.max(0, combCount - combsSold);
        const fillPct     = combCount > 0 ? Math.min(100, Math.round((combsSold / combCount) * 100)) : 0;
        const poolValue   = swarm.pool_value || (swarm.comb_count * swarm.comb_price) || 0;
        const marginPct   = swarm.margin_pct !== undefined ? swarm.margin_pct + '%' : '--';
        const uniqueMembers = swarm.unique_members || swarm.member_count || '--';

        const holders     = swarm.comb_holders || swarm.holders || [];
        const drawResult  = swarm.draw_result || swarm.draw || null;

        // Countdown
        const countdownHtml = this._buildCountdown(swarm.deadline, status);

        // Draw result card
        const drawCardHtml = this._buildDrawCard(drawResult, status);

        // Shipping form
        const shippingHtml = this._buildShippingForm(swarm);

        root.innerHTML = `
            <div class="swarm-detail-page">
                <nav class="swarm-breadcrumb" aria-label="Breadcrumb">
                    <a href="/admin/">Dashboard</a>
                    <span class="breadcrumb-sep">&rsaquo;</span>
                    <a href="/admin/swarms">Swarms</a>
                    <span class="breadcrumb-sep">&rsaquo;</span>
                    <span>Swarm #${this._escHtml(String(swarm.id || id))}</span>
                </nav>

                <div class="swarm-detail-hero">
                    <div class="swarm-detail-hero-left">
                        ${imgSrc ? `<div class="swarm-detail-img-wrap"><img src="${this._escHtml(imgSrc)}" alt="${productName}" class="swarm-detail-img">${badgeHtml}</div>` : ''}
                        <div class="swarm-detail-hero-info">
                            <h1 class="swarm-detail-title">${productName} #${this._escHtml(String(swarm.id || id))} ${badgeHtml}</h1>
                            <p class="swarm-detail-desc">${this._escHtml(swarm.description || '')}</p>
                            ${countdownHtml}
                        </div>
                    </div>
                    <div class="swarm-detail-hero-actions">
                        <a href="/admin/swarms/${swarm.id}/edit" class="btn-admin-ghost">Edit Swarm</a>
                        ${shippingHtml}
                    </div>
                </div>

                <div class="swarm-detail-stats">
                    <div class="stat-card">
                        <div class="stat-label">Combs sold</div>
                        <div class="stat-value">${this._formatNumber(combsSold)} / ${this._formatNumber(combCount)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Unique members</div>
                        <div class="stat-value">${this._formatNumber(uniqueMembers)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Total Nectar</div>
                        <div class="stat-value">Nt ${this._formatNumber(Math.round(poolValue))}</div>
                    </div>
                </div>

                <div class="swarm-detail-progress-bar">
                    <div class="swarm-detail-progress-track">
                        <div class="swarm-detail-progress-fill" style="width:${fillPct}%"></div>
                    </div>
                    <div class="swarm-detail-progress-labels">
                        <span>${fillPct}% filled</span>
                        <span>${this._formatNumber(remaining)} remaining</span>
                    </div>
                </div>

                <div class="swarm-detail-body">
                    <div class="swarm-detail-holders-section">
                        <div class="dashboard-section-header">
                            <h2 class="dashboard-section-title">Comb holders</h2>
                            <button class="btn-admin-ghost swarm-export-btn" id="export-holders-csv">Export CSV</button>
                        </div>
                        <div id="swarm-holders-table">
                            <p class="dashboard-loading">Loading...</p>
                        </div>
                    </div>

                    <div class="swarm-detail-draw-section">
                        ${drawCardHtml}
                    </div>
                </div>
            </div>`;

        this._renderHoldersTable(holders, combsSold);
        this._bindDetailEvents(swarm);
    }

    /**
     * Render the comb holders table with client-side pagination if >50 combs.
     * @param {Array} holders
     * @param {number} totalCombs
     */
    _renderHoldersTable(holders, totalCombs) {
        const el = document.getElementById('swarm-holders-table');
        if (!el) return;

        if (!holders || holders.length === 0) {
            el.innerHTML = '<p class="dashboard-empty">No Comb holders yet.</p>';
            return;
        }

        // Determine if we need pagination
        const needsPagination = totalCombs > 50;
        const totalPages = needsPagination ? Math.max(1, Math.ceil(holders.length / this._holdersPerPage)) : 1;
        if (this._holdersPage > totalPages) this._holdersPage = totalPages;

        const displayHolders = needsPagination
            ? holders.slice((this._holdersPage - 1) * this._holdersPerPage, this._holdersPage * this._holdersPerPage)
            : holders;

        const rows = displayHolders.map((h) => {
            const name    = this._escHtml(h.member_name || h.name || h.username || 'Unknown');
            const combs   = h.combs_held || h.combs || 0;
            const oddsPct = h.odds_pct !== undefined ? h.odds_pct + '%' : (h.odds !== undefined ? h.odds + '%' : '--');
            const joined  = h.joined_at || h.created_at || h.timestamp || '';
            const dateStr = joined ? this._formatDateTime(joined) : '--';
            const spent   = h.spent !== undefined ? 'Nt ' + this._formatNumber(Math.round(h.spent)) : '--';

            return `<tr>
                <td>
                    <div class="holder-name-cell">
                        <div class="holder-avatar">${name.charAt(0).toUpperCase()}</div>
                        <span>${name}</span>
                    </div>
                </td>
                <td>${combs}</td>
                <td>${spent}</td>
                <td>${dateStr}</td>
            </tr>`;
        }).join('');

        const paginationHtml = needsPagination
            ? this._buildPagination(this._holdersPage, totalPages, holders.length, 'holders')
            : (holders.length > displayHolders.length
                ? `<div class="swarm-holders-loadmore"><button class="btn-admin-ghost" id="load-more-holders">Load ${holders.length - displayHolders.length} more holders...</button></div>`
                : '');

        el.innerHTML = `
            <table class="admin-table" aria-label="Comb holders">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Combs</th>
                        <th>Spent</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${paginationHtml}`;

        if (needsPagination) {
            this._bindPagination('holders', totalPages, (page) => {
                this._holdersPage = page;
                this._renderHoldersTable(holders, totalCombs);
            });
        }
    }

    /**
     * Build the draw result card HTML.
     * @param {Object|null} draw
     * @param {string} status
     * @returns {string}
     */
    _buildDrawCard(draw, status) {
        const showDraw = draw && (status === 'draw_complete' || status === 'shipped' || status === 'full');

        if (!showDraw) {
            if (status === 'active' || status === 'filling_fast') {
                return `<div class="swarm-draw-card swarm-draw-card--pending">
                    <h3 class="swarm-draw-card-title">Draw status</h3>
                    <p class="swarm-draw-card-pending-text">Draw will be triggered automatically when all Combs are purchased.</p>
                </div>`;
            }
            return '';
        }

        const winnerName = this._escHtml(draw.winner_name || draw.winner || 'Unknown');
        const combNumber = draw.winning_comb || draw.comb_number || '--';
        const drawDate   = draw.drawn_at || draw.draw_date || '';
        const randomOrg  = draw.verification_url || draw.random_org_url || '';
        const totalEntries = draw.total_entries || '--';

        return `<div class="swarm-draw-card">
            <h3 class="swarm-draw-card-title">Draw status</h3>
            <div class="swarm-draw-method">
                <span class="swarm-draw-method-label">METHOD</span>
                <span class="status-badge badge--active">VERIFIED</span>
            </div>
            <p class="swarm-draw-method-desc">"Draw triggered automatically via Random.org upon Swarm completion."</p>

            <div class="swarm-draw-winner">
                <div class="swarm-draw-winner-label">WINNING MEMBER</div>
                <div class="swarm-draw-winner-row">
                    <div class="holder-avatar">${winnerName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="swarm-draw-winner-name">${winnerName}</div>
                        <div class="swarm-draw-winner-sub">Verified winner</div>
                    </div>
                </div>
            </div>

            <div class="swarm-draw-stats">
                <div>
                    <div class="swarm-draw-stats-label">WINNING COMB</div>
                    <div class="swarm-draw-stats-value">#${this._escHtml(String(combNumber))}</div>
                </div>
                <div>
                    <div class="swarm-draw-stats-label">TOTAL ENTRIES</div>
                    <div class="swarm-draw-stats-value">${this._escHtml(String(totalEntries))}</div>
                </div>
            </div>

            ${randomOrg ? `<a href="${this._escHtml(randomOrg)}" target="_blank" rel="noopener noreferrer" class="btn-admin-ghost swarm-draw-verify-link">Verification link (Random.org)</a>` : ''}
            ${drawDate ? `<div class="swarm-draw-date">Draw completed: ${this._formatDateTime(drawDate)}</div>` : ''}
        </div>`;
    }

    /**
     * Build the countdown timer HTML.
     * @param {string} deadline
     * @param {string} status
     * @returns {string}
     */
    _buildCountdown(deadline, status) {
        if (!deadline || status === 'draw_complete' || status === 'shipped' || status === 'expired' || status === 'cancelled') {
            return '';
        }

        const now  = Date.now();
        const end  = new Date(deadline).getTime();
        const diff = end - now;

        if (diff <= 0) {
            return '<div class="swarm-countdown">Deadline passed</div>';
        }

        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins  = Math.floor((diff % 3600000) / 60000);
        const secs  = Math.floor((diff % 60000) / 1000);

        const urgency = diff < 3600000 ? ' swarm-countdown--urgent' : '';

        return `<div class="swarm-countdown${urgency}">
            <span class="swarm-countdown-label">TIME REMAINING</span>
            <span class="swarm-countdown-value">${days > 0 ? days + 'd ' : ''}${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s</span>
        </div>`;
    }

    /**
     * Build the shipping status update form.
     * @param {Object} swarm
     * @returns {string}
     */
    _buildShippingForm(swarm) {
        const status = swarm.status || '';
        if (status !== 'draw_complete' && status !== 'full' && status !== 'shipped') {
            return '';
        }

        if (status === 'shipped') {
            const trackingNumber = swarm.tracking_number || '';
            return `<div class="swarm-shipping-info">
                <span class="status-badge badge--active">Shipped</span>
                ${trackingNumber ? `<div class="swarm-shipping-tracking">Tracking: ${this._escHtml(trackingNumber)}</div>` : ''}
            </div>`;
        }

        return `<div class="swarm-shipping-form" id="shipping-form">
            <div class="form-group">
                <label for="tracking-number">Tracking number</label>
                <input type="text" id="tracking-number" placeholder="Enter tracking number">
            </div>
            <button class="btn-admin-primary" id="mark-shipped-btn">Ship items</button>
        </div>`;
    }

    /**
     * Bind detail page events: shipping form, export CSV.
     * @param {Object} swarm
     */
    _bindDetailEvents(swarm) {
        const shippedBtn = document.getElementById('mark-shipped-btn');
        if (shippedBtn) {
            shippedBtn.addEventListener('click', async () => {
                const trackingInput = document.getElementById('tracking-number');
                const trackingNumber = trackingInput ? trackingInput.value.trim() : '';

                shippedBtn.disabled = true;
                shippedBtn.textContent = 'Updating...';

                try {
                    const response = await fetch('/api/v1/admin/swarms/' + encodeURIComponent(swarm.id), {
                        method: 'PATCH',
                        headers: {
                            ...this._authHeaders(),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: 'shipped',
                            tracking_number: trackingNumber
                        })
                    });
                    const body = await response.json();
                    if (!response.ok || !body.success) {
                        throw new Error(body.message || 'Failed to update shipping status.');
                    }
                    // Re-render detail to reflect updated status
                    this.renderDetail(swarm.id);
                } catch (err) {
                    alert(err.message);
                    shippedBtn.disabled = false;
                    shippedBtn.textContent = 'Ship items';
                }
            });
        }

        const exportBtn = document.getElementById('export-holders-csv');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const holders = swarm.comb_holders || swarm.holders || [];
                this._exportHoldersCSV(holders);
            });
        }
    }

    /**
     * Export comb holders as CSV download.
     * @param {Array} holders
     */
    _exportHoldersCSV(holders) {
        if (!holders || holders.length === 0) return;

        const headers = ['Member', 'Combs', 'Spent', 'Timestamp'];
        const rows = holders.map((h) => [
            h.member_name || h.name || h.username || '',
            h.combs_held || h.combs || 0,
            h.spent !== undefined ? h.spent : '',
            h.joined_at || h.created_at || h.timestamp || ''
        ]);

        let csv = headers.join(',') + '\n';
        rows.forEach((row) => {
            csv += row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'comb-holders.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // =========================================
    // Shared: Step Progress Indicator
    // =========================================

    /**
     * Build the 3-step progress indicator HTML.
     * @param {number} currentStep - 1, 2, or 3
     * @returns {string}
     */
    _stepProgress(currentStep) {
        const steps = [
            { num: 1, label: 'PRODUCT' },
            { num: 2, label: 'PARAMETERS' },
            { num: 3, label: 'REVIEW' }
        ];

        const stepsHtml = steps.map((s, i) => {
            let cls = 'step';
            if (s.num < currentStep) cls += ' complete';
            if (s.num === currentStep) cls += ' active';

            const icon = s.num < currentStep
                ? '<span class="step-check">&#10003;</span>'
                : `<span class="step-number">${s.num}</span>`;

            const divider = i < steps.length - 1 ? '<div class="step-divider"></div>' : '';

            return `<div class="${cls}">${icon}<span class="step-label">${s.label}</span></div>${divider}`;
        }).join('');

        return `<div class="step-progress">${stepsHtml}</div>`;
    }

    // =========================================
    // Shared: Pagination
    // =========================================

    /**
     * Build pagination HTML.
     * @param {number} currentPage
     * @param {number} totalPages
     * @param {number} totalItems
     * @param {string} prefix - unique ID prefix for pagination buttons
     * @returns {string}
     */
    _buildPagination(currentPage, totalPages, totalItems, prefix) {
        if (totalPages <= 1) {
            return `<div class="pagination-info">Showing ${totalItems} item${totalItems !== 1 ? 's' : ''}</div>`;
        }

        const start = (currentPage - 1) * (prefix === 'holders' ? this._holdersPerPage : this._listPerPage) + 1;
        const end   = Math.min(currentPage * (prefix === 'holders' ? this._holdersPerPage : this._listPerPage), totalItems);

        let pages = '';
        const prevDisabled = currentPage <= 1 ? ' disabled' : '';
        const nextDisabled = currentPage >= totalPages ? ' disabled' : '';

        pages += `<button class="pagination-btn pagination-prev" data-page="${currentPage - 1}" ${prevDisabled}>&lsaquo;</button>`;

        for (let p = 1; p <= totalPages; p++) {
            if (totalPages > 7 && p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
                if (p === 2 && currentPage > 4) {
                    pages += '<span class="pagination-ellipsis">...</span>';
                } else if (p === totalPages - 1 && currentPage < totalPages - 3) {
                    pages += '<span class="pagination-ellipsis">...</span>';
                }
                continue;
            }
            const active = p === currentPage ? ' pagination-btn--active' : '';
            pages += `<button class="pagination-btn${active}" data-page="${p}">${p}</button>`;
        }

        pages += `<button class="pagination-btn pagination-next" data-page="${currentPage + 1}" ${nextDisabled}>&rsaquo;</button>`;

        return `<div class="pagination-wrap" id="${prefix}-pagination">
            <span class="pagination-info">Showing ${start}-${end} of ${totalItems} items</span>
            <div class="pagination-controls">${pages}</div>
        </div>`;
    }

    /**
     * Bind pagination click events.
     * @param {string} prefix
     * @param {number} totalPages
     * @param {Function} onPageChange
     */
    _bindPagination(prefix, totalPages, onPageChange) {
        const container = document.getElementById(prefix + '-pagination');
        if (!container) return;

        container.querySelectorAll('.pagination-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.getAttribute('data-page'), 10);
                if (page >= 1 && page <= totalPages) {
                    onPageChange(page);
                }
            });
        });
    }

    // =========================================
    // Private: Helpers
    // =========================================

    /**
     * Get common auth headers for API calls.
     * @returns {Object}
     */
    _authHeaders() {
        const token = App.Admin.AuthService.getToken();
        return {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token
        };
    }

    /**
     * Build a status badge HTML string using brand colours.
     * @param {string} status
     * @returns {string}
     */
    _statusBadge(status) {
        const map = {
            'active':        'badge--active',
            'filling_fast':  'badge--filling-fast',
            'full':          'badge--full',
            'draw_complete': 'badge--draw-complete',
            'draft':         'badge--draft',
            'expired':       'badge--expired',
            'cancelled':     'badge--cancelled',
            'shipped':       'badge--draw-complete'
        };
        const cls   = map[status] || 'badge--active';
        const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `<span class="status-badge ${cls}">${this._escHtml(label)}</span>`;
    }

    /**
     * Compute deadline extra info (e.g. "3 days left", "Closed").
     * @param {Object} swarm
     * @returns {string}
     */
    _deadlineExtra(swarm) {
        if (!swarm.deadline) return '';
        const status = swarm.status || '';
        if (status === 'full' || status === 'draw_complete' || status === 'shipped') {
            return 'Closed';
        }
        if (status === 'expired' || status === 'cancelled') {
            return '';
        }

        const now  = Date.now();
        const end  = new Date(swarm.deadline).getTime();
        const diff = end - now;
        if (diff <= 0) return 'Expired';

        const days = Math.floor(diff / 86400000);
        if (days > 0) return days + ' day' + (days !== 1 ? 's' : '') + ' left';
        const hours = Math.floor(diff / 3600000);
        if (hours > 0) return hours + ' hour' + (hours !== 1 ? 's' : '') + ' left';
        const mins = Math.floor(diff / 60000);
        return mins + ' min' + (mins !== 1 ? 's' : '') + ' left';
    }

    /**
     * Format a number with locale thousand separators.
     * @param {number} n
     * @returns {string}
     */
    _formatNumber(n) {
        const num = parseInt(n, 10);
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-CA');
    }

    /**
     * Format a decimal number to 2 decimal places.
     * @param {number} n
     * @returns {string}
     */
    _formatDecimal(n) {
        const num = parseFloat(n);
        if (isNaN(num)) return '0.00';
        return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Format an ISO date string to short human-readable date.
     * @param {string} isoString
     * @returns {string}
     */
    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-CA', {
                month: 'short',
                day:   'numeric',
                year:  'numeric'
            });
        } catch (_) {
            return isoString;
        }
    }

    /**
     * Format an ISO datetime string to date and time.
     * @param {string} isoString
     * @returns {string}
     */
    _formatDateTime(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-CA', {
                month: 'short',
                day:   'numeric',
                year:  'numeric'
            }) + ', ' + d.toLocaleTimeString('en-CA', {
                hour:   '2-digit',
                minute: '2-digit'
            });
        } catch (_) {
            return isoString;
        }
    }

    /**
     * Escape a string for safe HTML insertion.
     * @param {string} str
     * @returns {string}
     */
    _escHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /**
     * Escape a string for use in an HTML attribute value.
     * @param {string} str
     * @returns {string}
     */
    _escAttr(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/'/g,  '&#39;')
            .replace(/"/g,  '&quot;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;');
    }
};
