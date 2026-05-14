/**
 * App.Controllers.SwarmDetailController
 * Renders the Swarm detail page — product gallery, purchase panel,
 * live odds, progress bar, countdown, and draw result.
 *
 * - Reads swarm id from URL path (e.g. /ca/swarms/42)
 * - Fetches GET /swarms/{id} and optionally GET /wallet
 * - Caches swarm detail in IndexedDB for offline reads
 * - Comb purchase via ApiService.mutate() (queued if offline)
 * - Auto-refreshes progress bar / odds every 30 seconds
 */

'use strict';

window.App          = window.App          || {};
App.Controllers     = App.Controllers     || {};

App.Controllers.SwarmDetailController = class SwarmDetailController extends App.Controllers.BaseController {

    constructor() {
        super();
        /** @type {number|null} Swarm ID from URL */
        this._swarmId = null;
        /** @type {Object|null} Full swarm payload */
        this._swarm = null;
        /** @type {Object|null} Wallet balance data */
        this._wallet = null;
        /** @type {IDBDatabase|null} */
        this._db = null;
        /** @type {number|null} Auto-refresh interval ID */
        this._refreshInterval = null;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    /**
     * Entry point. Parse swarm id from URL, load data, render page.
     * @returns {void}
     */
    init() {
        this._swarmId = this._parseSwarmId();

        if (!this._swarmId) {
            $('#app-root').html('<div class="container mt-3"><p class="empty-state">Swarm not found.</p></div>');
            return;
        }

        // Show loading state
        $('#app-root').html(
            '<div class="page-loading"><span class="spinner"></span> Loading Swarm details&hellip;</div>'
        );

        // Load wallet in parallel if authenticated
        if (this._auth.isLoggedIn()) {
            this.loadWalletBalance();
        }

        this.loadSwarm(this._swarmId);
    }

    /**
     * Clean up timers when navigating away.
     * @returns {void}
     */
    destroy() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    // -------------------------
    // Data loading
    // -------------------------

    /**
     * Fetch swarm detail from API. Cache to IndexedDB on success.
     * Falls back to cached data on failure.
     * @param {number} id
     * @returns {Promise<void>}
     */
    async loadSwarm(id) {
        try {
            const response = await this._api.get('/swarms/' + id);
            this._swarm = response.data;
            await this._cacheSwarm(id, this._swarm);
            this.renderPage(this._swarm);
        } catch (err) {
            // Attempt cache fallback
            const cached = await this._readCachedSwarm(id);
            if (cached) {
                this._swarm = cached;
                this.renderPage(this._swarm);
                this.showInfo('Showing cached data. Some information may be outdated.');
            } else {
                // Fallback SEO metadata when swarm data is unavailable
                App.Utils.SEO.setPageMeta({
                    title:       'Swarm — Honeycolm',
                    description: 'Browse crowd-purchase Swarms on Honeycolm. One lucky bee wins the honey. Verified by Random.org.',
                    canonical:   'https://honeycolm.ca/ca/swarms/' + id,
                });
                $('#app-root').html(
                    '<div class="container mt-3"><p class="empty-state">Unable to load this Swarm. Please try again later.</p></div>'
                );
                this.showError(err.message || 'Failed to load Swarm.');
            }
        }
    }

    /**
     * Fetch the authenticated member's wallet balance.
     * @returns {Promise<void>}
     */
    async loadWalletBalance() {
        try {
            const response = await this._api.get('/wallet');
            this._wallet = response.data;
        } catch (err) {
            // Non-critical — purchase panel will show balance unavailable
            this._wallet = null;
        }
    }

    // -------------------------
    // Rendering
    // -------------------------

    /**
     * Render the full detail page into #app-root.
     * @param {Object} swarm
     * @returns {void}
     */
    renderPage(swarm) {
        const product = swarm.product || {};
        const images  = (product.images && product.images.length > 0) ? product.images : [];
        const isTerminal = ['full', 'draw_complete', 'shipped', 'expired', 'cancelled'].includes(swarm.status);

        // ── SEO metadata — set after API data is available ────────────────────
        const productName  = product.name || swarm.title || 'Swarm';
        const retailValue  = product.retail_value ? 'Nt ' + product.retail_value : '';
        const combPrice    = swarm.comb_price ? 'Nt ' + parseFloat(swarm.comb_price) + ' per Comb' : '';
        const descParts    = [productName + ' Swarm on Honeycolm.'];
        if (retailValue)  { descParts.push('Retail value: ' + retailValue + '.'); }
        if (combPrice)    { descParts.push(combPrice + '.'); }
        descParts.push('Verified by Random.org. No manual draws. Ever.');
        const dynamicDesc  = descParts.join(' ').slice(0, 160);
        const swarmId      = this._swarmId || '';

        App.Utils.SEO.setPageMeta({
            title:     productName + ' — Swarm on Honeycolm',
            description: dynamicDesc,
            canonical: 'https://honeycolm.ca/ca/swarms/' + swarmId,
        });

        let html = '<div class="swarm-detail-page container">';
        html += '<div class="swarm-detail">';

        // Left column — gallery
        html += '<div class="swarm-gallery">';
        html += this._renderGalleryHtml(images, product.name || swarm.title);
        html += '</div>';

        // Right column — purchase panel
        html += '<div class="swarm-purchase-panel">';
        html += this._renderPurchasePanelHtml(swarm);
        html += '</div>';

        html += '</div>'; // close .swarm-detail

        // Draw callout — always shown for active and filling_fast swarms
        html += this._renderDrawCalloutHtml(swarm);

        // Draw result — shown when draw is complete or shipped
        if (swarm.draw && (swarm.status === 'draw_complete' || swarm.status === 'shipped')) {
            html += this._renderDrawResultHtml(swarm.draw);
        }

        html += '</div>'; // close .swarm-detail-page

        $('#app-root').html(html);

        // Post-render bindings
        this._bindGalleryEvents();
        this._bindPurchaseEvents(swarm);

        // Start countdown timers
        App.Components.CountdownTimer.startAll();

        // Auto-refresh every 30 seconds (only for non-terminal swarms)
        if (!isTerminal) {
            this._startAutoRefresh();
        }
    }

    /**
     * Build gallery HTML with main image and thumbnail row.
     * @param {Object[]} images
     * @param {string} altText
     * @returns {string}
     */
    _renderGalleryHtml(images, altText) {
        const safeAlt = this._escape(altText || 'Product image');

        if (images.length === 0) {
            return `
                <div class="main-image-wrap">
                    <div class="main-image main-image--placeholder" aria-label="No product image available"></div>
                </div>`;
        }

        const mainSrc = images[0].url || images[0].image_url || '';
        let html = `
            <div class="main-image-wrap">
                <img id="gallery-main-image" class="main-image" src="${this._escape(mainSrc)}" alt="${safeAlt}">
            </div>`;

        if (images.length > 1) {
            html += '<div class="thumbnails">';
            images.forEach((img, index) => {
                const src = img.url || img.image_url || '';
                const activeClass = index === 0 ? ' active' : '';
                html += `<img class="thumbnail${activeClass}" src="${this._escape(src)}" alt="${safeAlt} thumbnail ${index + 1}" data-full-src="${this._escape(src)}">`;
            });
            html += '</div>';
        }

        return html;
    }

    /**
     * Build purchase panel HTML.
     * @param {Object} swarm
     * @returns {string}
     */
    _renderPurchasePanelHtml(swarm) {
        const product = swarm.product || {};
        const productName = product.name || swarm.title || 'Product';
        const retailValue = product.retail_value || 0;
        const combPrice   = parseFloat(swarm.comb_price) || 0;
        const combCount   = swarm.comb_count || 0;
        const combsSold   = swarm.combs_sold || 0;
        const combsRemaining = swarm.combs_remaining || (combCount - combsSold);
        const fillPct     = combCount > 0 ? Math.min(100, Math.round((combsSold / combCount) * 100)) : 0;
        const isLoggedIn  = this._auth.isLoggedIn();
        const isTerminal  = ['full', 'draw_complete', 'shipped', 'expired', 'cancelled'].includes(swarm.status);

        // Status badge
        const badgeClass = this._badgeClass(swarm.status);
        const badgeLabel = this._badgeLabel(swarm.status);

        let html = '';

        // Product name
        html += `<h1 class="swarm-detail__product-name">${this._escape(productName)}</h1>`;

        // Retail value
        if (retailValue > 0) {
            html += `<p class="swarm-detail__retail-value">Retail value: Nt ${retailValue}</p>`;
        }

        // Status badge
        html += `<span class="badge ${badgeClass}">${badgeLabel}</span>`;

        // Progress bar
        html += `
            <div class="progress-bar-wrap mt-2">
                <div class="progress-bar-label">
                    <span>${combsSold} of ${combCount} Combs sold</span>
                    <span id="combs-remaining-label">${combsRemaining} remaining</span>
                </div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" id="progress-bar-fill" style="width:${fillPct}%;"></div>
                </div>
            </div>`;

        // Odds display
        if (isLoggedIn && typeof swarm.member_odds !== 'undefined' && swarm.member_odds !== null) {
            const combs = swarm.member_combs_held || 0;
            html += `<div class="odds-display" id="odds-display">Your odds: ${swarm.member_odds}% (${combs} Comb${combs !== 1 ? 's' : ''} held)</div>`;
        } else if (isLoggedIn) {
            html += '<div class="odds-display" id="odds-display">Enter to see your odds</div>';
        } else {
            html += '<div class="odds-display" id="odds-display">Login to see your odds</div>';
        }

        // Countdown timer
        if (swarm.deadline) {
            html += '<div class="swarm-detail__timer mt-1">';
            html += App.Components.CountdownTimer.renderInline(swarm.deadline);
            html += '</div>';
        }

        // Comb price
        html += `<p class="swarm-detail__comb-price mt-2">Nt ${combPrice} per Comb</p>`;

        // Purchase form or terminal status message
        if (isTerminal) {
            html += this._renderTerminalStatusHtml(swarm.status);
        } else if (!isLoggedIn) {
            // Unauthenticated — show login CTA
            html += `
                <div class="swarm-purchase-form mt-2">
                    <a href="/ca/login" class="btn-primary" style="width:100%;justify-content:center;">Login to enter</a>
                </div>`;
        } else {
            // Authenticated — show purchase form
            const perMemberLimit = swarm.per_member_comb_limit || combCount;
            const memberHeld     = swarm.member_combs_held || 0;
            const maxCanBuy      = Math.max(0, Math.min(perMemberLimit - memberHeld, combsRemaining));
            const totalBalance   = this._wallet ? parseFloat(this._wallet.total_balance) : null;
            const canAfford      = totalBalance !== null ? Math.floor(totalBalance / combPrice) : null;

            if (maxCanBuy <= 0) {
                html += '<div class="swarm-purchase-form mt-2"><p class="empty-state">You have reached your Comb limit for this Swarm.</p></div>';
            } else {
                const effectiveMax = canAfford !== null ? Math.min(maxCanBuy, canAfford) : maxCanBuy;

                html += `
                    <div class="swarm-purchase-form mt-2">
                        <div class="quantity-selector">
                            <label for="comb-quantity">Quantity:</label>
                            <button type="button" id="qty-minus" class="qty-btn" aria-label="Decrease quantity">&minus;</button>
                            <input type="number" id="comb-quantity" min="1" max="${maxCanBuy}" value="1" step="1">
                            <button type="button" id="qty-plus" class="qty-btn" aria-label="Increase quantity">&plus;</button>
                        </div>
                        <div class="cost-preview" id="cost-preview">Nt ${combPrice} for 1 Comb</div>`;

                // Wallet balance display
                if (totalBalance !== null) {
                    html += `<p class="swarm-detail__wallet-balance">Your Nectar balance: Nt ${totalBalance.toFixed(2)}</p>`;

                    if (totalBalance < combPrice) {
                        html += `<p class="swarm-detail__topup-notice"><a href="/ca/wallet">Top up your Nectar</a> to enter this Swarm.</p>`;
                        html += '<button class="btn-primary btn-primary--disabled" disabled style="width:100%;justify-content:center;">Insufficient Nectar</button>';
                    } else {
                        html += `<button class="btn-primary" id="btn-enter-swarm" style="width:100%;justify-content:center;" data-swarm-id="${swarm.id}">Enter Swarm &mdash; Nt ${combPrice}</button>`;
                    }
                } else {
                    // Wallet failed to load — allow purchase attempt anyway
                    html += `<button class="btn-primary" id="btn-enter-swarm" style="width:100%;justify-content:center;" data-swarm-id="${swarm.id}">Enter Swarm &mdash; Nt ${combPrice}</button>`;
                }

                html += '</div>';
            }
        }

        return html;
    }

    /**
     * Build HTML for terminal swarm states (no purchase available).
     * @param {string} status
     * @returns {string}
     */
    _renderTerminalStatusHtml(status) {
        const messages = {
            full:           'This Swarm is full. The draw will be triggered shortly.',
            draw_complete:  'The draw for this Swarm is complete. See the result below.',
            shipped:        'The prize has been shipped to the winner.',
            expired:        'This Swarm has expired. All Combs have been refunded.',
            cancelled:      'This Swarm was cancelled. All Combs have been refunded.',
        };

        const msg = messages[status] || 'This Swarm is no longer accepting entries.';
        return `<div class="swarm-detail__terminal-status mt-2"><p class="empty-state">${msg}</p></div>`;
    }

    /**
     * Build draw callout HTML.
     * @param {Object} swarm
     * @returns {string}
     */
    _renderDrawCalloutHtml(swarm) {
        return `<div class="draw-callout">Draw triggered automatically by Random.org when the last Comb is purchased. No manual draws. Ever.</div>`;
    }

    /**
     * Build draw result HTML.
     * @param {Object} draw
     * @returns {string}
     */
    _renderDrawResultHtml(draw) {
        const winnerName = this._escape(draw.winner_first_name || 'A lucky member');
        const winnerCity = draw.winner_city ? `, ${this._escape(draw.winner_city)}` : '';
        const itemWon    = draw.item_won ? this._escape(draw.item_won) : '';
        const verifyUrl  = draw.random_org_verify_url || '';

        let html = '<div class="draw-result">';
        html += '<h3 class="draw-result__heading">Draw Result</h3>';
        html += `<p class="draw-result__winner">${winnerName}${winnerCity}</p>`;

        if (itemWon) {
            html += `<p class="draw-result__item">Won: ${itemWon}</p>`;
        }

        if (verifyUrl) {
            html += `<p class="draw-result__verify"><a href="${this._escape(verifyUrl)}" target="_blank" rel="noopener">Verify this draw on Random.org</a></p>`;
        }

        html += '</div>';
        return html;
    }

    // -------------------------
    // Event binding
    // -------------------------

    /**
     * Bind thumbnail gallery click events.
     * @returns {void}
     */
    _bindGalleryEvents() {
        $(document).off('click.swarmGallery').on('click.swarmGallery', '.swarm-gallery .thumbnail', function () {
            const src = $(this).data('full-src');
            if (src) {
                $('#gallery-main-image').attr('src', src);
                $('.swarm-gallery .thumbnail').removeClass('active');
                $(this).addClass('active');
            }
        });
    }

    /**
     * Bind purchase form events — quantity change and submit.
     * @param {Object} swarm
     * @returns {void}
     */
    _bindPurchaseEvents(swarm) {
        const self = this;
        const combPrice = parseFloat(swarm.comb_price) || 0;

        // Quantity input change — update cost preview
        $(document).off('input.swarmQty change.swarmQty').on('input.swarmQty change.swarmQty', '#comb-quantity', function () {
            self.updateCostPreview();
        });

        // Plus / minus buttons
        $(document).off('click.qtyMinus').on('click.qtyMinus', '#qty-minus', function () {
            const $input = $('#comb-quantity');
            const current = parseInt($input.val(), 10) || 1;
            const min = parseInt($input.attr('min'), 10) || 1;
            if (current > min) {
                $input.val(current - 1).trigger('change');
            }
        });

        $(document).off('click.qtyPlus').on('click.qtyPlus', '#qty-plus', function () {
            const $input = $('#comb-quantity');
            const current = parseInt($input.val(), 10) || 1;
            const max = parseInt($input.attr('max'), 10) || 1;
            if (current < max) {
                $input.val(current + 1).trigger('change');
            }
        });

        // Enter Swarm button click
        $(document).off('click.enterSwarm').on('click.enterSwarm', '#btn-enter-swarm', function (e) {
            e.preventDefault();
            self.onPurchase();
        });
    }

    // -------------------------
    // Actions
    // -------------------------

    /**
     * Update cost preview text based on current quantity value.
     * @returns {void}
     */
    updateCostPreview() {
        const combPrice = parseFloat(this._swarm.comb_price) || 0;
        const $input    = $('#comb-quantity');
        let quantity    = parseInt($input.val(), 10);
        const min       = parseInt($input.attr('min'), 10) || 1;
        const max       = parseInt($input.attr('max'), 10) || 1;

        // Clamp quantity
        if (isNaN(quantity) || quantity < min) { quantity = min; }
        if (quantity > max) { quantity = max; }

        const totalCost = (combPrice * quantity).toFixed(2);
        const label     = quantity === 1 ? '1 Comb' : `${quantity} Combs`;

        $('#cost-preview').text(`Nt ${totalCost} for ${label}`);

        // Also update the Enter Swarm button label
        const $btn = $('#btn-enter-swarm');
        if ($btn.length) {
            $btn.html(`Enter Swarm &mdash; Nt ${totalCost}`);
        }

        // Check affordability live
        if (this._wallet) {
            const balance = parseFloat(this._wallet.total_balance);
            const cost = combPrice * quantity;
            if (cost > balance) {
                $btn.prop('disabled', true).text('Insufficient Nectar');
            } else {
                $btn.prop('disabled', false).html(`Enter Swarm &mdash; Nt ${totalCost}`);
            }
        }
    }

    /**
     * Handle Comb purchase. Uses ApiService.mutate() for offline support.
     * @returns {Promise<void>}
     */
    async onPurchase() {
        const $btn    = $('#btn-enter-swarm');
        const $input  = $('#comb-quantity');
        let quantity  = parseInt($input.val(), 10);

        if (isNaN(quantity) || quantity < 1) { quantity = 1; }

        // Disable button and show loading
        this.setLoading('#btn-enter-swarm', true);

        try {
            const result = await this._api.mutate('POST', '/swarms/' + this._swarmId + '/combs', { quantity });

            if (result.queued) {
                // Offline — purchase queued, not confirmed
                this.showInfo('Your purchase has been queued and will be confirmed when you are back online.');
            } else {
                // Success — online
                const combLabel = quantity === 1 ? '1 Comb' : `${quantity} Combs`;
                this.showSuccess(`You're in! You now hold ${combLabel} in this Swarm.`);

                // Update wallet if new balance returned
                if (result.data && result.data.new_wallet_balance) {
                    this._wallet = result.data.new_wallet_balance;
                }

                // Refresh swarm data to update odds, progress bar, etc.
                await this.loadSwarm(this._swarmId);
            }
        } catch (err) {
            const msg = err.message || 'Purchase failed. Please try again.';
            this.showError(msg);
        } finally {
            this.setLoading('#btn-enter-swarm', false);
        }
    }

    // -------------------------
    // Auto-refresh
    // -------------------------

    /**
     * Start auto-refresh interval (30s) to update progress and odds.
     * @returns {void}
     */
    _startAutoRefresh() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }

        this._refreshInterval = setInterval(async () => {
            try {
                const response = await this._api.get('/swarms/' + this._swarmId + '/odds');
                if (response && response.data) {
                    this._updateLiveStats(response.data);
                }
            } catch (err) {
                // Silently fail — stale data is acceptable
            }
        }, 30000);
    }

    /**
     * Update live stats on the page without a full re-render.
     * @param {Object} data  Response from GET /swarms/{id}/odds
     * @returns {void}
     */
    _updateLiveStats(data) {
        const combCount = data.comb_count || 0;
        const combsSold = data.combs_sold || 0;
        const combsRemaining = data.combs_remaining || (combCount - combsSold);
        const fillPct = combCount > 0 ? Math.min(100, Math.round((combsSold / combCount) * 100)) : 0;

        // Update progress bar
        $('#progress-bar-fill').css('width', fillPct + '%');
        $('#combs-remaining-label').text(combsRemaining + ' remaining');

        // Update odds display
        const isLoggedIn = this._auth.isLoggedIn();
        if (isLoggedIn && typeof data.member_odds !== 'undefined' && data.member_odds !== null) {
            const combs = data.member_combs_held || 0;
            $('#odds-display').text(`Your odds: ${data.member_odds}% (${combs} Comb${combs !== 1 ? 's' : ''} held)`);
        }

        // Update swarm object in memory
        if (this._swarm) {
            this._swarm.combs_sold = combsSold;
            this._swarm.combs_remaining = combsRemaining;
            if (typeof data.member_odds !== 'undefined') {
                this._swarm.member_odds = data.member_odds;
            }
            if (typeof data.member_combs_held !== 'undefined') {
                this._swarm.member_combs_held = data.member_combs_held;
            }
        }
    }

    // -------------------------
    // Helpers
    // -------------------------

    /**
     * Parse swarm ID from URL path.
     * Expected format: /ca/swarms/{id} or /{region}/swarms/{id}
     * @returns {number|null}
     */
    _parseSwarmId() {
        const path = window.location.pathname;
        const match = path.match(/\/swarms\/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * Return the CSS badge class for a given swarm status.
     * @param {string} status
     * @returns {string}
     */
    _badgeClass(status) {
        const map = {
            active:         'badge--active',
            filling_fast:   'badge--filling-fast',
            full:           'badge--full',
            draw_complete:  'badge--draw-complete',
            draft:          'badge--draft',
            expired:        'badge--expired',
            cancelled:      'badge--cancelled',
            shipped:        'badge--draw-complete',
        };
        return map[status] || 'badge--active';
    }

    /**
     * Return the display label for a given swarm status.
     * @param {string} status
     * @returns {string}
     */
    _badgeLabel(status) {
        const map = {
            active:         'Active',
            filling_fast:   'Filling Fast',
            full:           'Full',
            draw_complete:  'Draw Complete',
            draft:          'Draft',
            expired:        'Expired',
            cancelled:      'Cancelled',
            shipped:        'Shipped',
        };
        return map[status] || 'Active';
    }

    /**
     * Escape a string for safe HTML insertion.
     * @param {string} str
     * @returns {string}
     */
    _escape(str) {
        if (typeof str !== 'string') { return ''; }
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // -------------------------
    // IndexedDB cache helpers
    // -------------------------

    /**
     * Open (or reuse) the IndexedDB database with store 'swarm-detail-cache'.
     * @returns {Promise<IDBDatabase>}
     */
    _openDb() {
        if (this._db) {
            return Promise.resolve(this._db);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('honeycolm', 2);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('swarms-cache')) {
                    db.createObjectStore('swarms-cache');
                }
                if (!db.objectStoreNames.contains('swarm-detail-cache')) {
                    db.createObjectStore('swarm-detail-cache');
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
     * Write swarm detail to IndexedDB.
     * @param {number} id
     * @param {Object} swarm
     * @returns {Promise<void>}
     */
    async _cacheSwarm(id, swarm) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx    = db.transaction('swarm-detail-cache', 'readwrite');
                const store = tx.objectStore('swarm-detail-cache');
                const req   = store.put(swarm, 'swarm-' + id);
                req.onsuccess = () => resolve();
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            // Non-critical — silently swallow
        }
    }

    /**
     * Read cached swarm detail from IndexedDB.
     * @param {number} id
     * @returns {Promise<Object|null>}
     */
    async _readCachedSwarm(id) {
        try {
            const db = await this._openDb();
            return await new Promise((resolve, reject) => {
                const tx    = db.transaction('swarm-detail-cache', 'readonly');
                const store = tx.objectStore('swarm-detail-cache');
                const req   = store.get('swarm-' + id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            return null;
        }
    }
};
