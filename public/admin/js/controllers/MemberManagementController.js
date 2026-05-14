/**
 * App.Admin.Controllers.MemberManagementController
 * Admin member management: list and detail views.
 *
 * Routes (URL-based):
 *  /admin/members        -> renderList()
 *  /admin/members/       -> renderList()
 *  /admin/members/{id}   -> renderDetail(id)
 *
 * Uses admin JWT via App.Admin.AuthService.getToken().
 * Admin panel has no service worker -- no offline queue needed.
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};

App.Admin.Controllers.MemberManagementController = class MemberManagementController {

    constructor() {
        /** @type {number} Current page for member list pagination */
        this._listPage = 1;

        /** @type {number} Members per page */
        this._listPerPage = 25;

        /** @type {number|null} Total pages returned by the API */
        this._listTotalPages = 1;

        /** @type {number} Total members returned by the API */
        this._listTotal = 0;

        /** @type {string} Current status filter tab */
        this._activeFilter = 'all';

        /** @type {string} Current search query */
        this._searchQuery = '';

        /** @type {number|null} Debounce timer for search input */
        this._searchTimer = null;

        /** @type {number} Current page for transaction history */
        this._txPage = 1;

        /** @type {number} Transactions per page */
        this._txPerPage = 20;

        /** @type {number} Total transaction pages */
        this._txTotalPages = 1;

        /** @type {number} Total transactions */
        this._txTotal = 0;

        /** @type {Array} All transactions for the current member detail view */
        this._transactions = [];

        /** @type {number} Current page for entered swarms list */
        this._swarmsPage = 1;

        /** @type {number} Swarms per page */
        this._swarmsPerPage = 20;

        /** @type {number} Total swarms pages */
        this._swarmsTotalPages = 1;

        /** @type {number} Total swarms */
        this._swarmsTotal = 0;

        /** @type {Array} All entered swarms for the current member detail view */
        this._enteredSwarms = [];
    }

    // =========================================
    // Public API
    // =========================================

    /**
     * Initialise the controller. Reads the URL and renders the correct view.
     */
    init() {
        this._route();
    }

    // =========================================
    // Routing
    // =========================================

    /**
     * Read the current URL and render the matching view.
     */
    _route() {
        const path = window.location.pathname;

        const detailMatch = path.match(/\/admin\/members\/(\d+)\/?$/);
        if (detailMatch) {
            this.renderDetail(detailMatch[1]);
        } else {
            this.renderList();
        }
    }

    // =========================================
    // RENDER: Member List
    // =========================================

    /**
     * Renders the member list page with status filter tabs, search, and paginated table.
     */
    async renderList() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = `
            <div class="member-list-page">
                <div class="dashboard-header">
                    <div>
                        <h1 class="dashboard-title">Member Management</h1>
                        <p class="member-list-subtitle">View and manage all registered members.</p>
                    </div>
                </div>

                <div class="swarm-filter-tabs" id="member-filter-tabs" role="tablist" aria-label="Filter members by status">
                </div>

                <div class="swarm-search-row">
                    <input type="text" id="member-search" class="swarm-search-input" placeholder="Search by name or email..." aria-label="Search members">
                </div>

                <div id="member-list-content">
                    <p class="dashboard-loading">Loading...</p>
                </div>
            </div>`;

        this._renderFilterTabs();
        this._bindListEvents();
        await this._loadMembers();
    }

    /**
     * Render the status filter tab bar.
     */
    _renderFilterTabs() {
        const container = document.getElementById('member-filter-tabs');
        if (!container) return;

        const tabs = [
            { key: 'all',         label: 'All' },
            { key: 'active',      label: 'Active' },
            { key: 'deactivated', label: 'Deactivated' }
        ];

        container.innerHTML = tabs.map((t) => {
            const active = t.key === this._activeFilter ? ' active' : '';
            return `<button class="filter-tab${active}" data-filter="${t.key}" role="tab" aria-selected="${t.key === this._activeFilter}">${this._escHtml(t.label)}</button>`;
        }).join('');
    }

    /**
     * Bind list page events: search input (debounced), filter tabs.
     */
    _bindListEvents() {
        const searchInput = document.getElementById('member-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(async () => {
                    this._searchQuery = e.target.value.trim();
                    this._listPage = 1;
                    await this._loadMembers();
                }, 300);
            });
        }

        const tabContainer = document.getElementById('member-filter-tabs');
        if (tabContainer) {
            tabContainer.addEventListener('click', async (e) => {
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

                await this._loadMembers();
            });
        }
    }

    /**
     * Build the API URL for the member list with current filters and pagination.
     * @returns {string}
     */
    _buildListUrl() {
        const params = new URLSearchParams();
        params.set('page', String(this._listPage));
        params.set('per_page', String(this._listPerPage));
        if (this._searchQuery) {
            params.set('search', this._searchQuery);
        }
        if (this._activeFilter !== 'all') {
            params.set('status', this._activeFilter);
        }
        return '/api/v1/admin/members?' + params.toString();
    }

    /**
     * Fetch members from the API and render the table.
     */
    async _loadMembers() {
        const el = document.getElementById('member-list-content');
        if (el) {
            el.innerHTML = '<p class="dashboard-loading">Loading...</p>';
        }

        let members = [];
        try {
            const response = await fetch(this._buildListUrl(), {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to load members.');
            }

            const data = body.data || {};
            members = data.members || data.items || data || [];

            // Support paginated meta envelope
            if (data.pagination) {
                this._listTotalPages = data.pagination.total_pages || 1;
                this._listTotal      = data.pagination.total       || members.length;
            } else if (data.meta) {
                this._listTotalPages = data.meta.total_pages || data.meta.last_page || 1;
                this._listTotal      = data.meta.total       || members.length;
            } else {
                this._listTotalPages = 1;
                this._listTotal      = members.length;
            }

        } catch (err) {
            if (el) {
                el.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(err.message)}</div>`;
            }
            return;
        }

        this._renderMemberTable(members);
    }

    /**
     * Render the members table with pagination controls.
     * @param {Array} members
     */
    _renderMemberTable(members) {
        const el = document.getElementById('member-list-content');
        if (!el) return;

        if (!members || members.length === 0) {
            el.innerHTML = '<p class="dashboard-empty">No members match your filters.</p>';
            return;
        }

        const rows = members.map((member) => {
            const id      = member.id || '';
            const name    = this._escHtml(member.name || member.full_name || '—');
            const email   = this._escHtml(member.email || '—');
            const region  = this._formatRegion(member.region || member.country_code || '');
            const joined  = member.created_at || member.joined_at || member.registered_at || '';
            const joinedFormatted = joined ? this._formatDate(joined) : '—';
            const status  = member.status || 'active';
            const badge   = this._memberStatusBadge(status);

            const walletTotal = member.wallet
                ? (member.wallet.total !== undefined
                    ? member.wallet.total
                    : ((member.wallet.deposit_balance || 0) + (member.wallet.bonus_balance || 0)))
                : (member.wallet_total !== undefined ? member.wallet_total : null);
            const walletDisplay = walletTotal !== null ? this._formatNectar(walletTotal) : '—';

            const href = '/admin/members/' + id;

            return `<tr class="member-list-row" style="cursor:pointer;" data-href="${this._escHtml(href)}">
                <td>${name}</td>
                <td>${email}</td>
                <td>${region}</td>
                <td>${joinedFormatted}</td>
                <td>${badge}</td>
                <td>${walletDisplay}</td>
            </tr>`;
        }).join('');

        const paginationHtml = this._buildPagination(
            this._listPage,
            this._listTotalPages,
            this._listTotal,
            'member-list'
        );

        el.innerHTML = `
            <div class="dashboard-swarms-wrap">
                <table class="admin-table" aria-label="Members">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Region</th>
                            <th>Joined</th>
                            <th>Status</th>
                            <th>Wallet Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${paginationHtml}`;

        // Row click navigation
        el.querySelectorAll('.member-list-row').forEach((row) => {
            row.addEventListener('click', () => {
                const href = row.getAttribute('data-href');
                if (href) {
                    window.location.href = href;
                }
            });
        });

        this._bindPagination('member-list', this._listTotalPages, async (page) => {
            this._listPage = page;
            await this._loadMembers();
        });
    }

    // =========================================
    // RENDER: Member Detail
    // =========================================

    /**
     * Renders the admin detail view for a single member.
     * @param {string|number} id
     */
    async renderDetail(id) {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = '<p class="dashboard-loading">Loading member details...</p>';

        let member;
        try {
            const response = await fetch('/api/v1/admin/members/' + encodeURIComponent(id), {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to load member.');
            }
            member = body.data || body.member || body;
        } catch (err) {
            root.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(err.message)}</div>`;
            return;
        }

        // Cache right-column data
        this._transactions  = member.transactions  || member.transaction_history || [];
        this._enteredSwarms = member.swarms         || member.entered_swarms      || [];

        root.innerHTML = `
            <div class="member-detail-page">
                <nav class="swarm-breadcrumb" aria-label="Breadcrumb">
                    <a href="/admin/">Dashboard</a>
                    <span class="breadcrumb-sep">&rsaquo;</span>
                    <a href="/admin/members">Members</a>
                    <span class="breadcrumb-sep">&rsaquo;</span>
                    <span>${this._escHtml(member.name || member.full_name || 'Member #' + id)}</span>
                </nav>

                <div class="member-detail-layout">

                    <!-- Left column -->
                    <div class="member-detail-left">

                        <!-- Account info -->
                        <div class="admin-card" id="member-account-card">
                            ${this._buildAccountCard(member)}
                        </div>

                        <!-- Wallet -->
                        <div class="admin-card" id="member-wallet-card">
                            ${this._buildWalletCard(member)}
                        </div>

                        <!-- Admin actions -->
                        <div class="admin-card" id="member-actions-card">
                            ${this._buildActionsCard(member)}
                        </div>

                    </div>

                    <!-- Right column -->
                    <div class="member-detail-right">

                        <!-- Transaction history -->
                        <div class="admin-card">
                            <h2 class="dashboard-section-title">Transaction History</h2>
                            <div id="member-tx-table">
                                <p class="dashboard-loading">Loading...</p>
                            </div>
                        </div>

                        <!-- Entered swarms -->
                        <div class="admin-card">
                            <h2 class="dashboard-section-title">Entered Swarms</h2>
                            <div id="member-swarms-table">
                                <p class="dashboard-loading">Loading...</p>
                            </div>
                        </div>

                    </div>

                </div>
            </div>`;

        this._renderTxTable();
        this._renderEnteredSwarmsTable();
        this._bindDetailEvents(member);
    }

    // =========================================
    // Detail: Left column builders
    // =========================================

    /**
     * Build the account info card HTML.
     * @param {Object} member
     * @returns {string}
     */
    _buildAccountCard(member) {
        const name    = this._escHtml(member.name || member.full_name || '—');
        const email   = this._escHtml(member.email || '—');
        const region  = this._formatRegion(member.region || member.country_code || '');
        const joined  = member.created_at || member.joined_at || member.registered_at || '';
        const joinedFormatted = joined ? this._formatDate(joined) : '—';
        const status  = member.status || 'active';
        const badge   = this._memberStatusBadge(status);

        return `
            <h2 class="dashboard-section-title">Account Info</h2>
            <dl class="member-info-list">
                <dt>Name</dt>
                <dd>${name}</dd>
                <dt>Email</dt>
                <dd>${email}</dd>
                <dt>Region</dt>
                <dd>${region}</dd>
                <dt>Joined</dt>
                <dd>${joinedFormatted}</dd>
                <dt>Status</dt>
                <dd>${badge}</dd>
            </dl>`;
    }

    /**
     * Build the wallet card HTML.
     * @param {Object} member
     * @returns {string}
     */
    _buildWalletCard(member) {
        const wallet = member.wallet || {};
        const deposit = wallet.deposit_balance !== undefined ? wallet.deposit_balance : (member.deposit_balance || 0);
        const bonus   = wallet.bonus_balance   !== undefined ? wallet.bonus_balance   : (member.bonus_balance   || 0);
        const total   = wallet.total           !== undefined ? wallet.total           : (deposit + bonus);

        return `
            <h2 class="dashboard-section-title">Wallet</h2>
            <dl class="member-info-list">
                <dt>Deposit Balance</dt>
                <dd>${this._formatNectar(deposit)}</dd>
                <dt>Bonus Balance</dt>
                <dd>${this._formatNectar(bonus)}</dd>
                <dt>Total</dt>
                <dd><strong>${this._formatNectar(total)}</strong></dd>
            </dl>`;
    }

    /**
     * Build the admin actions card HTML.
     * @param {Object} member
     * @returns {string}
     */
    _buildActionsCard(member) {
        const status    = member.status || 'active';
        const isActive  = status === 'active';

        const statusActionHtml = isActive
            ? `<div class="member-action-group">
                   <button class="btn-admin-danger" id="deactivate-btn">Deactivate account</button>
                   <div class="member-confirm-wrap" id="deactivate-confirm" style="display:none;">
                       <p class="member-confirm-text">This will prevent the member from logging in or entering Swarms. Confirm?</p>
                       <button class="btn-admin-danger" id="deactivate-confirm-btn">Yes, deactivate</button>
                       <button class="btn-admin-ghost member-confirm-cancel" id="deactivate-cancel-btn">Cancel</button>
                   </div>
               </div>`
            : `<div class="member-action-group">
                   <button class="btn-admin-primary" id="reactivate-btn">Reactivate account</button>
               </div>`;

        return `
            <h2 class="dashboard-section-title">Admin Actions</h2>

            ${statusActionHtml}

            <hr class="member-actions-divider">

            <h3 class="member-actions-subtitle">Manual Nectar Adjustment</h3>
            <div id="member-adjust-message"></div>
            <form id="member-adjust-form" class="member-adjust-form" novalidate>
                <div class="form-group">
                    <label for="adjust-amount">Amount (positive = credit, negative = debit)</label>
                    <div class="input-with-prefix">
                        <span class="input-prefix">Nt</span>
                        <input type="number" id="adjust-amount" step="0.01" placeholder="e.g. 50 or -25" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="adjust-bucket">Bucket</label>
                    <select id="adjust-bucket" class="form-select" required>
                        <option value="bonus">Bonus</option>
                        <option value="deposit">Deposit</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="adjust-notes">Notes <span class="form-required">*</span></label>
                    <textarea id="adjust-notes" rows="3" placeholder="Reason for adjustment..." required></textarea>
                </div>
                <button type="submit" class="btn-admin-primary" id="adjust-submit-btn">Apply adjustment</button>
            </form>`;
    }

    // =========================================
    // Detail: Right column renderers
    // =========================================

    /**
     * Render the transaction history table with client-side pagination.
     */
    _renderTxTable() {
        const el = document.getElementById('member-tx-table');
        if (!el) return;

        const all        = this._transactions;
        const totalItems = all.length;

        if (totalItems === 0) {
            el.innerHTML = '<p class="dashboard-empty">No transactions yet.</p>';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(totalItems / this._txPerPage));
        if (this._txPage > totalPages) this._txPage = totalPages;

        const start    = (this._txPage - 1) * this._txPerPage;
        const pageItems = all.slice(start, start + this._txPerPage);

        const rows = pageItems.map((tx) => {
            const date      = tx.created_at || tx.date || tx.timestamp || '';
            const dateStr   = date ? this._formatDateTime(date) : '—';
            const type      = this._escHtml(tx.type || tx.transaction_type || '—');
            const amount    = tx.amount !== undefined
                ? ((parseFloat(tx.amount) >= 0 ? '+' : '') + this._formatNectar(tx.amount))
                : '—';
            const bucket    = this._escHtml(tx.bucket || tx.wallet_type || '—');
            const balAfter  = tx.balance_after !== undefined ? this._formatNectar(tx.balance_after) : '—';

            return `<tr>
                <td>${dateStr}</td>
                <td>${type}</td>
                <td>${amount}</td>
                <td>${bucket}</td>
                <td>${balAfter}</td>
            </tr>`;
        }).join('');

        const paginationHtml = this._buildPagination(this._txPage, totalPages, totalItems, 'member-tx');

        el.innerHTML = `
            <table class="admin-table" aria-label="Transaction history">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Bucket</th>
                        <th>Balance After</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${paginationHtml}`;

        this._bindPagination('member-tx', totalPages, (page) => {
            this._txPage = page;
            this._renderTxTable();
        });
    }

    /**
     * Render the entered swarms table with client-side pagination.
     */
    _renderEnteredSwarmsTable() {
        const el = document.getElementById('member-swarms-table');
        if (!el) return;

        const all        = this._enteredSwarms;
        const totalItems = all.length;

        if (totalItems === 0) {
            el.innerHTML = '<p class="dashboard-empty">No Swarms entered yet.</p>';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(totalItems / this._swarmsPerPage));
        if (this._swarmsPage > totalPages) this._swarmsPage = totalPages;

        const start     = (this._swarmsPage - 1) * this._swarmsPerPage;
        const pageItems = all.slice(start, start + this._swarmsPerPage);

        const rows = pageItems.map((entry) => {
            const swarmName = this._escHtml(entry.swarm_name || entry.product_name || entry.name || '—');
            const swarmId   = entry.swarm_id || entry.id || '';
            const nameHtml  = swarmId
                ? `<a class="swarm-link" href="/admin/swarms/${swarmId}">${swarmName}</a>`
                : swarmName;
            const combs     = entry.combs_held || entry.combs || 0;
            const status    = entry.status     || '—';
            const badgeHtml = status !== '—' ? this._statusBadge(status) : '—';
            const result    = this._escHtml(entry.result || entry.outcome || '—');

            return `<tr>
                <td>${nameHtml}</td>
                <td>${combs}</td>
                <td>${badgeHtml}</td>
                <td>${result}</td>
            </tr>`;
        }).join('');

        const paginationHtml = this._buildPagination(this._swarmsPage, totalPages, totalItems, 'member-swarms');

        el.innerHTML = `
            <table class="admin-table" aria-label="Entered Swarms">
                <thead>
                    <tr>
                        <th>Swarm</th>
                        <th>Combs Held</th>
                        <th>Status</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${paginationHtml}`;

        this._bindPagination('member-swarms', totalPages, (page) => {
            this._swarmsPage = page;
            this._renderEnteredSwarmsTable();
        });
    }

    // =========================================
    // Detail: Event binding
    // =========================================

    /**
     * Bind all interactive events for the detail page.
     * @param {Object} member
     */
    _bindDetailEvents(member) {
        this._bindStatusActions(member);
        this._bindAdjustForm(member);
    }

    /**
     * Bind deactivate / reactivate button events.
     * @param {Object} member
     */
    _bindStatusActions(member) {
        const status   = member.status || 'active';
        const isActive = status === 'active';

        if (isActive) {
            const deactivateBtn = document.getElementById('deactivate-btn');
            const confirmWrap   = document.getElementById('deactivate-confirm');
            const confirmBtn    = document.getElementById('deactivate-confirm-btn');
            const cancelBtn     = document.getElementById('deactivate-cancel-btn');

            if (deactivateBtn && confirmWrap) {
                deactivateBtn.addEventListener('click', () => {
                    confirmWrap.style.display = '';
                    deactivateBtn.style.display = 'none';
                });
            }

            if (cancelBtn && confirmWrap && deactivateBtn) {
                cancelBtn.addEventListener('click', () => {
                    confirmWrap.style.display = 'none';
                    deactivateBtn.style.display = '';
                });
            }

            if (confirmBtn) {
                confirmBtn.addEventListener('click', async () => {
                    confirmBtn.disabled = true;
                    confirmBtn.textContent = 'Deactivating...';
                    await this._patchMemberStatus(member.id, 'deactivated');
                });
            }

        } else {
            const reactivateBtn = document.getElementById('reactivate-btn');
            if (reactivateBtn) {
                reactivateBtn.addEventListener('click', async () => {
                    reactivateBtn.disabled = true;
                    reactivateBtn.textContent = 'Reactivating...';
                    await this._patchMemberStatus(member.id, 'active');
                });
            }
        }
    }

    /**
     * PATCH a member's status and re-render the detail page on success.
     * @param {string|number} id
     * @param {string} newStatus
     */
    async _patchMemberStatus(id, newStatus) {
        try {
            const response = await fetch('/api/v1/admin/members/' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: {
                    ...this._authHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            const body = await response.json();
            if (!response.ok || !body.success) {
                throw new Error(body.message || 'Failed to update member status.');
            }
            // Re-render the full detail page with the updated data
            this.renderDetail(id);
        } catch (err) {
            alert(err.message);
            // Re-enable whichever button is present
            const btn = document.getElementById('deactivate-confirm-btn') || document.getElementById('reactivate-btn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = newStatus === 'deactivated' ? 'Yes, deactivate' : 'Reactivate account';
            }
        }
    }

    /**
     * Bind the manual Nectar adjustment form submission.
     * @param {Object} member
     */
    _bindAdjustForm(member) {
        const form = document.getElementById('member-adjust-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const amountInput = document.getElementById('adjust-amount');
            const bucketInput = document.getElementById('adjust-bucket');
            const notesInput  = document.getElementById('adjust-notes');
            const submitBtn   = document.getElementById('adjust-submit-btn');
            const msgEl       = document.getElementById('member-adjust-message');

            if (msgEl) msgEl.innerHTML = '';

            const amount = amountInput ? parseFloat(amountInput.value) : NaN;
            const bucket = bucketInput ? bucketInput.value : '';
            const notes  = notesInput  ? notesInput.value.trim() : '';

            if (isNaN(amount) || amount === 0) {
                if (msgEl) {
                    msgEl.innerHTML = `<div class="form-error" role="alert">Please enter a non-zero amount.</div>`;
                }
                return;
            }
            if (!notes) {
                if (msgEl) {
                    msgEl.innerHTML = `<div class="form-error" role="alert">Notes are required.</div>`;
                }
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Applying...';
            }

            try {
                const response = await fetch(
                    '/api/v1/admin/members/' + encodeURIComponent(member.id) + '/wallet/adjust',
                    {
                        method: 'POST',
                        headers: {
                            ...this._authHeaders(),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ amount, bucket, notes })
                    }
                );
                const body = await response.json();
                if (!response.ok || !body.success) {
                    throw new Error(body.message || 'Failed to apply adjustment.');
                }

                // Show success message
                if (msgEl) {
                    msgEl.innerHTML = `<div class="form-success" role="status">Adjustment applied successfully.</div>`;
                }

                // Reset form fields
                if (amountInput) amountInput.value = '';
                if (notesInput)  notesInput.value  = '';

                // Refresh wallet card from returned data (or re-fetch)
                await this._refreshWalletCard(member.id);

            } catch (err) {
                if (msgEl) {
                    msgEl.innerHTML = `<div class="form-error" role="alert">${this._escHtml(err.message)}</div>`;
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Apply adjustment';
                }
            }
        });
    }

    /**
     * Re-fetch a single member and repaint only the wallet card.
     * @param {string|number} id
     */
    async _refreshWalletCard(id) {
        const walletCard = document.getElementById('member-wallet-card');
        if (!walletCard) return;

        try {
            const response = await fetch('/api/v1/admin/members/' + encodeURIComponent(id), {
                method: 'GET',
                headers: this._authHeaders()
            });
            const body = await response.json();
            if (!response.ok || !body.success) return;

            const updatedMember = body.data || body.member || body;
            walletCard.innerHTML = this._buildWalletCard(updatedMember);
        } catch (_) {
            // Non-fatal -- wallet card stays as-is
        }
    }

    // =========================================
    // Shared: Pagination
    // =========================================

    /**
     * Build pagination HTML.
     * @param {number} currentPage
     * @param {number} totalPages
     * @param {number} totalItems
     * @param {string} prefix - unique ID prefix for pagination elements
     * @returns {string}
     */
    _buildPagination(currentPage, totalPages, totalItems, prefix) {
        if (totalPages <= 1) {
            return `<div class="pagination-info">Showing ${totalItems} item${totalItems !== 1 ? 's' : ''}</div>`;
        }

        const perPage  = this._perPageFor(prefix);
        const start    = (currentPage - 1) * perPage + 1;
        const end      = Math.min(currentPage * perPage, totalItems);

        const prevDisabled = currentPage <= 1          ? ' disabled' : '';
        const nextDisabled = currentPage >= totalPages  ? ' disabled' : '';

        let pages = '';
        pages += `<button class="pagination-btn pagination-prev" data-page="${currentPage - 1}"${prevDisabled}>&lsaquo;</button>`;

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

        pages += `<button class="pagination-btn pagination-next" data-page="${currentPage + 1}"${nextDisabled}>&rsaquo;</button>`;

        return `<div class="pagination-wrap" id="${prefix}-pagination">
            <span class="pagination-info">Showing ${start}&#8211;${end} of ${totalItems} items</span>
            <div class="pagination-controls">${pages}</div>
        </div>`;
    }

    /**
     * Return the per-page count for a given pagination prefix.
     * @param {string} prefix
     * @returns {number}
     */
    _perPageFor(prefix) {
        if (prefix === 'member-tx')     return this._txPerPage;
        if (prefix === 'member-swarms') return this._swarmsPerPage;
        return this._listPerPage;
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
            'Accept':        'application/json',
            'Authorization': 'Bearer ' + token
        };
    }

    /**
     * Build a member status badge HTML string.
     * @param {string} status
     * @returns {string}
     */
    _memberStatusBadge(status) {
        const map = {
            'active':      'badge--active',
            'deactivated': 'badge--cancelled',
            'suspended':   'badge--expired',
            'pending':     'badge--draft'
        };
        const cls   = map[status] || 'badge--draft';
        const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `<span class="status-badge ${cls}">${this._escHtml(label)}</span>`;
    }

    /**
     * Build a generic swarm status badge HTML string.
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
        const cls   = map[status] || 'badge--draft';
        const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `<span class="status-badge ${cls}">${this._escHtml(label)}</span>`;
    }

    /**
     * Format a region code as a flag emoji + code string.
     * e.g. "CA" -> "🇨🇦 CA"
     * @param {string} code
     * @returns {string}
     */
    _formatRegion(code) {
        if (!code) return '—';

        const upper = code.toUpperCase().trim();

        // Build flag emoji from regional indicator letters (works for 2-letter ISO codes)
        let flag = '';
        if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) {
            flag = String.fromCodePoint(
                upper.charCodeAt(0) - 0x41 + 0x1F1E6,
                upper.charCodeAt(1) - 0x41 + 0x1F1E6
            ) + ' ';
        }

        return flag + this._escHtml(upper);
    }

    /**
     * Format a Nectar value with the Nt prefix and thousand separators.
     * e.g. 45800 -> "Nt 45,800"
     * @param {number} n
     * @returns {string}
     */
    _formatNectar(n) {
        const num = parseFloat(n);
        if (isNaN(num)) return 'Nt 0';
        // Show decimal if non-integer
        const formatted = Number.isInteger(num)
            ? num.toLocaleString('en-CA')
            : num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return 'Nt ' + formatted;
    }

    /**
     * Format a plain integer with locale thousand separators.
     * @param {number} n
     * @returns {string}
     */
    _formatNumber(n) {
        const num = parseInt(n, 10);
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-CA');
    }

    /**
     * Format an ISO date string to a short human-readable date.
     * e.g. "2026-04-15T00:00:00Z" -> "Apr 15, 2026"
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
     * e.g. "2026-04-15T10:30:00Z" -> "Apr 15, 2026, 10:30 AM"
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
};
