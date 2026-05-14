/**
 * App.Admin.Controllers.WithdrawalController
 * App.Admin.Controllers.DrawController
 * App.Admin.Controllers.FinanceController
 *
 * Renders operational admin pages into #admin-root.
 *
 * API calls use this._api.get(path) and this._api.mutate(method, path, data).
 * All classes follow the same namespace / ES6-class pattern as DashboardController.
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};


/* =========================================================================
   1. WithdrawalController
   ========================================================================= */

App.Admin.Controllers.WithdrawalController = class WithdrawalController {

    constructor(api) {
        // Accept an injected API service or fall back to the global one.
        this._api            = api || (window.App && App.Admin && App.Admin.ApiService) || null;
        this._currentStatus  = 'pending';
    }

    // -------------------------
    // Public API
    // -------------------------

    async init() {
        this._renderSkeleton();
        await this._loadWithdrawals(this._currentStatus);
    }

    // -------------------------
    // Private: data loading
    // -------------------------

    async _loadWithdrawals(status) {
        const $root = $('#admin-root');
        $root.find('.admin-table-wrap').html('<p class="admin-loading">Loading&hellip;</p>');

        let data;
        try {
            const response = await this._api.get('/api/v1/admin/withdrawals?status=' + encodeURIComponent(status));
            data = response.data || response;
        } catch (err) {
            $root.find('.admin-table-wrap').html(
                '<p class="admin-error" role="alert">' + this._escHtml(err.message || 'Failed to load withdrawals.') + '</p>'
            );
            return;
        }

        this._renderTable(data, status);
        this._bindTabEvents();
    }

    // -------------------------
    // Private: rendering
    // -------------------------

    _renderSkeleton() {
        const tabs = [
            { key: 'pending',  label: 'Pending'  },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'paid',     label: 'Paid'     }
        ];

        const tabHtml = tabs.map(t =>
            `<button class="admin-tab${t.key === this._currentStatus ? ' admin-tab--active' : ''}"
                     data-status="${t.key}">${t.label}</button>`
        ).join('');

        $('#admin-root').html(`
            <div class="admin-page-header">
                <h1 class="admin-page-title">Withdrawal Management</h1>
            </div>
            <div class="admin-tabs" role="tablist" aria-label="Withdrawal status filter">
                ${tabHtml}
            </div>
            <div class="admin-table-wrap">
                <p class="admin-loading">Loading&hellip;</p>
            </div>
        `);
    }

    _renderTable(withdrawals, status) {
        if (!withdrawals || withdrawals.length === 0) {
            $('#admin-root .admin-table-wrap').html(
                '<p class="admin-empty">No ' + this._escHtml(status) + ' withdrawals.</p>'
            );
            return;
        }

        const rows = withdrawals.map(w => this._renderRow(w, status)).join('');

        $('#admin-root .admin-table-wrap').html(`
            <table class="admin-table" aria-label="Withdrawals">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Amount</th>
                        <th>Requested</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `);

        this._bindActionEvents();
    }

    _renderRow(w, status) {
        const id         = w.id || '';
        const memberName = this._escHtml(
            (w.member && (w.member.first_name + ' ' + w.member.last_name)) ||
            w.member_name || 'Unknown'
        );
        const amountNt   = this._formatNectar(w.amount_nt || w.amount || 0);
        const amountCad  = w.amount_cad
            ? ' / $' + parseFloat(w.amount_cad).toFixed(2) + ' CAD'
            : '';
        const requested  = w.created_at ? this._formatDate(w.created_at) : '—';
        const region     = (w.member && w.member.region) || w.region || '';
        const method     = region === 'CA' ? 'Interac e-Transfer' : region === 'US' ? 'ACH' : '—';
        const badgeHtml  = this._statusBadge(w.status || status);

        let actionsHtml = '';
        if (status === 'pending') {
            actionsHtml = `
                <button class="admin-btn admin-btn--approve" data-id="${id}" data-action="approve">Approve</button>
                <button class="admin-btn admin-btn--reject"  data-id="${id}" data-action="reject">Reject</button>
                <div class="inline-action-form" id="inline-form-${id}" style="display:none;"></div>
            `;
        } else if (status === 'approved') {
            actionsHtml = `
                <button class="admin-btn admin-btn--paid" data-id="${id}" data-action="mark-paid">Mark as paid</button>
            `;
        } else {
            actionsHtml = '—';
        }

        return `<tr id="wd-row-${id}">
            <td>${memberName}</td>
            <td>${amountNt}${amountCad}</td>
            <td>${requested}</td>
            <td>${this._escHtml(method)}</td>
            <td>${badgeHtml}</td>
            <td class="actions-cell">${actionsHtml}</td>
        </tr>`;
    }

    // -------------------------
    // Private: event binding
    // -------------------------

    _bindTabEvents() {
        const self = this;
        $('#admin-root').off('click.wd-tab').on('click.wd-tab', '.admin-tab', function () {
            const status = $(this).data('status');
            if (!status) return;
            self._currentStatus = status;
            $('#admin-root .admin-tab').removeClass('admin-tab--active');
            $(this).addClass('admin-tab--active');
            self._loadWithdrawals(status);
        });
    }

    _bindActionEvents() {
        const self = this;

        // Approve button
        $('#admin-root').off('click.wd-approve').on('click.wd-approve', '[data-action="approve"]', function () {
            const id      = $(this).data('id');
            const $form   = $('#inline-form-' + id);
            const $row    = $('#wd-row-' + id);

            // Hide any other open forms on this row
            $row.find('.inline-action-form').hide().empty();

            $form.html(`
                <form class="inline-action-form__inner" data-confirm-action="approve" data-id="${id}">
                    <textarea name="notes" placeholder="Notes (optional)" rows="2" class="admin-textarea"></textarea>
                    <button type="submit" class="admin-btn admin-btn--confirm">Confirm approval</button>
                    <button type="button" class="admin-btn admin-btn--cancel" data-cancel-form="${id}">Cancel</button>
                </form>
            `).show();
        });

        // Reject button
        $('#admin-root').off('click.wd-reject').on('click.wd-reject', '[data-action="reject"]', function () {
            const id    = $(this).data('id');
            const $form = $('#inline-form-' + id);
            const $row  = $('#wd-row-' + id);

            $row.find('.inline-action-form').hide().empty();

            $form.html(`
                <form class="inline-action-form__inner" data-confirm-action="reject" data-id="${id}">
                    <textarea name="notes" placeholder="Reason for rejection (required)" rows="2"
                              class="admin-textarea" required></textarea>
                    <button type="submit" class="admin-btn admin-btn--danger">Confirm rejection</button>
                    <button type="button" class="admin-btn admin-btn--cancel" data-cancel-form="${id}">Cancel</button>
                </form>
            `).show();
        });

        // Cancel inline form
        $('#admin-root').off('click.wd-cancel').on('click.wd-cancel', '[data-cancel-form]', function () {
            const id = $(this).data('cancel-form');
            $('#inline-form-' + id).hide().empty();
        });

        // Confirm approval / rejection form submit
        $('#admin-root').off('submit.wd-confirm').on('submit.wd-confirm', '.inline-action-form__inner', async function (e) {
            e.preventDefault();
            const $form  = $(this);
            const action = $form.data('confirm-action');
            const id     = $form.data('id');
            const notes  = $form.find('[name="notes"]').val() || '';

            if (action === 'reject' && !notes.trim()) {
                alert('A reason is required when rejecting a withdrawal.');
                return;
            }

            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const payload   = { status: newStatus, notes: notes.trim() };

            $form.find('button').prop('disabled', true);

            try {
                await self._api.mutate('PATCH', '/api/v1/admin/withdrawals/' + id, payload);
                await self._loadWithdrawals(self._currentStatus);
            } catch (err) {
                alert('Error: ' + (err.message || 'Could not update withdrawal.'));
                $form.find('button').prop('disabled', false);
            }
        });

        // Mark as paid
        $('#admin-root').off('click.wd-paid').on('click.wd-paid', '[data-action="mark-paid"]', async function () {
            const id  = $(this).data('id');
            const $btn = $(this);
            $btn.prop('disabled', true).text('Saving…');

            try {
                await self._api.mutate('PATCH', '/api/v1/admin/withdrawals/' + id, { status: 'paid' });
                await self._loadWithdrawals(self._currentStatus);
            } catch (err) {
                alert('Error: ' + (err.message || 'Could not mark withdrawal as paid.'));
                $btn.prop('disabled', false).text('Mark as paid');
            }
        });
    }

    // -------------------------
    // Private: helpers
    // -------------------------

    _statusBadge(status) {
        const map = {
            'pending':  'badge--pending',
            'approved': 'badge--active',
            'rejected': 'badge--cancelled',
            'paid':     'badge--draw-complete'
        };
        const cls   = map[status] || 'badge--draft';
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        return `<span class="status-badge ${cls}">${this._escHtml(label)}</span>`;
    }

    _formatNectar(n) {
        return 'Nt ' + this._formatNumber(n);
    }

    _formatNumber(n) {
        const num = parseInt(n, 10);
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-CA');
    }

    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (_) {
            return isoString;
        }
    }

    _escHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }
};


/* =========================================================================
   2. DrawController
   ========================================================================= */

App.Admin.Controllers.DrawController = class DrawController {

    constructor(api) {
        this._api           = api || (window.App && App.Admin && App.Admin.ApiService) || null;
        this._currentFilter = 'all';
    }

    // -------------------------
    // Public API
    // -------------------------

    async init() {
        this._renderSkeleton();
        await this._loadDraws(this._currentFilter);
    }

    // -------------------------
    // Private: data loading
    // -------------------------

    async _loadDraws(filter) {
        $('#admin-root .admin-table-wrap').html('<p class="admin-loading">Loading&hellip;</p>');

        let data;
        try {
            const response = await this._api.get('/api/v1/admin/draws');
            data = response.data || response;
        } catch (err) {
            $('#admin-root .admin-table-wrap').html(
                '<p class="admin-error" role="alert">' + this._escHtml(err.message || 'Failed to load draws.') + '</p>'
            );
            return;
        }

        // Client-side filter
        let draws = Array.isArray(data) ? data : [];
        if (filter === 'awaiting_shipping') {
            draws = draws.filter(d => d.shipping_status !== 'shipped');
        } else if (filter === 'shipped') {
            draws = draws.filter(d => d.shipping_status === 'shipped');
        }

        this._renderTable(draws, filter);
        this._bindTabEvents();
    }

    // -------------------------
    // Private: rendering
    // -------------------------

    _renderSkeleton() {
        const tabs = [
            { key: 'all',               label: 'All'               },
            { key: 'awaiting_shipping', label: 'Awaiting shipping' },
            { key: 'shipped',           label: 'Shipped'           }
        ];

        const tabHtml = tabs.map(t =>
            `<button class="admin-tab${t.key === this._currentFilter ? ' admin-tab--active' : ''}"
                     data-filter="${t.key}">${t.label}</button>`
        ).join('');

        $('#admin-root').html(`
            <div class="admin-page-header">
                <h1 class="admin-page-title">Draw Management</h1>
            </div>
            <div class="admin-tabs" role="tablist" aria-label="Draw filter">
                ${tabHtml}
            </div>
            <div class="admin-table-wrap">
                <p class="admin-loading">Loading&hellip;</p>
            </div>
        `);
    }

    _renderTable(draws, filter) {
        if (!draws || draws.length === 0) {
            $('#admin-root .admin-table-wrap').html(
                '<p class="admin-empty">No draws' + (filter !== 'all' ? ' in this category' : '') + '.</p>'
            );
            return;
        }

        const rows = draws.map(d => this._renderRow(d)).join('');

        $('#admin-root .admin-table-wrap').html(`
            <table class="admin-table" aria-label="Draws">
                <thead>
                    <tr>
                        <th>Swarm name</th>
                        <th>Winner</th>
                        <th>Comb # won</th>
                        <th>Draw date</th>
                        <th>Verification</th>
                        <th>Shipping status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `);

        this._bindActionEvents();
    }

    _renderRow(d) {
        const id          = d.id || '';
        const swarmId     = d.swarm_id || '';
        const swarmName   = this._escHtml(d.swarm_name || d.product_name || 'Unnamed Swarm');
        const winner      = d.winner
            ? this._escHtml((d.winner.first_name || '') + ' — ' + (d.winner.city || d.winner.location || ''))
            : '—';
        const combNum     = d.comb_number !== undefined ? this._escHtml(String(d.comb_number)) : '—';
        const drawDate    = d.draw_date ? this._formatDate(d.draw_date) : '—';
        const verifyUrl   = d.random_org_verify_url
            ? `<a href="${this._escHtml(d.random_org_verify_url)}" target="_blank" rel="noopener noreferrer">Verify ↗</a>`
            : '—';
        const shipStatus  = this._escHtml(d.shipping_status || 'pending');
        const shipped     = d.shipping_status === 'shipped';

        const actionsHtml = shipped
            ? '<span class="admin-text-muted">Shipped</span>'
            : `<button class="admin-btn admin-btn--ship" data-id="${id}" data-swarm-id="${swarmId}" data-action="mark-shipped">
                   Mark shipped
               </button>
               <div class="inline-action-form" id="ship-form-${id}" style="display:none;"></div>`;

        return `<tr id="draw-row-${id}">
            <td>${swarmName}</td>
            <td>${winner}</td>
            <td>${combNum}</td>
            <td>${drawDate}</td>
            <td>${verifyUrl}</td>
            <td>${shipStatus}</td>
            <td class="actions-cell">${actionsHtml}</td>
        </tr>`;
    }

    // -------------------------
    // Private: event binding
    // -------------------------

    _bindTabEvents() {
        const self = this;
        $('#admin-root').off('click.draw-tab').on('click.draw-tab', '.admin-tab', function () {
            const filter = $(this).data('filter');
            if (!filter) return;
            self._currentFilter = filter;
            $('#admin-root .admin-tab').removeClass('admin-tab--active');
            $(this).addClass('admin-tab--active');
            self._loadDraws(filter);
        });
    }

    _bindActionEvents() {
        const self = this;

        // Open inline shipping form
        $('#admin-root').off('click.draw-ship').on('click.draw-ship', '[data-action="mark-shipped"]', function () {
            const id      = $(this).data('id');
            const swarmId = $(this).data('swarm-id');
            const $form   = $('#ship-form-' + id);

            $form.html(`
                <form class="inline-action-form__inner" data-confirm-action="ship"
                      data-id="${id}" data-swarm-id="${swarmId}">
                    <input type="text" name="tracking_number" placeholder="Tracking number"
                           class="admin-input" required />
                    <button type="submit" class="admin-btn admin-btn--confirm">Confirm shipment</button>
                    <button type="button" class="admin-btn admin-btn--cancel"
                            data-cancel-ship="${id}">Cancel</button>
                </form>
            `).show();
        });

        // Cancel shipping form
        $('#admin-root').off('click.draw-ship-cancel').on('click.draw-ship-cancel', '[data-cancel-ship]', function () {
            const id = $(this).data('cancel-ship');
            $('#ship-form-' + id).hide().empty();
        });

        // Submit shipment
        $('#admin-root').off('submit.draw-ship-confirm').on('submit.draw-ship-confirm',
            '.inline-action-form__inner[data-confirm-action="ship"]', async function (e) {

            e.preventDefault();
            const $form          = $(this);
            const swarmId        = $form.data('swarm-id');
            const id             = $form.data('id');
            const trackingNumber = $form.find('[name="tracking_number"]').val().trim();

            if (!trackingNumber) {
                alert('Please enter a tracking number.');
                return;
            }

            $form.find('button').prop('disabled', true);

            try {
                await self._api.mutate('PATCH', '/api/v1/admin/swarms/' + swarmId, {
                    shipping_status:  'shipped',
                    tracking_number:  trackingNumber
                });
                await self._loadDraws(self._currentFilter);
            } catch (err) {
                alert('Error: ' + (err.message || 'Could not update shipment status.'));
                $form.find('button').prop('disabled', false);
            }
        });
    }

    // -------------------------
    // Private: helpers
    // -------------------------

    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (_) {
            return isoString;
        }
    }

    _escHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }
};


/* =========================================================================
   3. FinanceController
   ========================================================================= */

App.Admin.Controllers.FinanceController = class FinanceController {

    constructor(api) {
        this._api = api || (window.App && App.Admin && App.Admin.ApiService) || null;
    }

    // -------------------------
    // Public API
    // -------------------------

    async init() {
        this._renderSkeleton();
        await this._loadFinance();
    }

    // -------------------------
    // Private: data loading
    // -------------------------

    async _loadFinance() {
        let data;
        try {
            const response = await this._api.get('/api/v1/admin/finance');
            data = response.data || response;
        } catch (err) {
            $('#admin-root .finance-content').html(
                '<p class="admin-error" role="alert">' + this._escHtml(err.message || 'Failed to load finance data.') + '</p>'
            );
            return;
        }

        this._renderStatCards(data.summary || {});
        this._renderTierTable(data.tier_breakdown || []);
        this._renderBarChart(data.monthly_revenue || []);
        this._renderRecentWithdrawals(data.recent_paid_withdrawals || []);
    }

    // -------------------------
    // Private: rendering
    // -------------------------

    _renderSkeleton() {
        $('#admin-root').html(`
            <div class="admin-page-header">
                <h1 class="admin-page-title">Nectar &amp; Finance Overview</h1>
            </div>
            <div class="finance-content">
                <p class="admin-loading">Loading&hellip;</p>
            </div>
        `);
    }

    _renderStatCards(summary) {
        const totalRevNt  = this._formatNectar(summary.total_topup_revenue_nt  || 0);
        const totalRevCad = summary.total_topup_revenue_cad
            ? ' / $' + parseFloat(summary.total_topup_revenue_cad).toFixed(2) + ' CAD'
            : '';
        const totalWdNt   = this._formatNectar(summary.total_withdrawals_paid_nt || 0);
        const totalBonNt  = this._formatNectar(summary.total_bonus_issued_nt     || 0);
        const marginNt    = this._formatNectar(summary.net_platform_margin_nt    || 0);

        const cards = `
            <div class="admin-stats-row">
                <div class="admin-stat-card">
                    <div class="stat-label">Total top-up revenue</div>
                    <div class="stat-value">${totalRevNt}${totalRevCad}</div>
                </div>
                <div class="admin-stat-card">
                    <div class="stat-label">Total withdrawals paid</div>
                    <div class="stat-value">${totalWdNt}</div>
                </div>
                <div class="admin-stat-card">
                    <div class="stat-label">Total bonus issued</div>
                    <div class="stat-value">${totalBonNt}</div>
                </div>
                <div class="admin-stat-card">
                    <div class="stat-label">Net platform margin</div>
                    <div class="stat-value">${marginNt}</div>
                </div>
            </div>
        `;

        $('#admin-root .finance-content').html(cards + '<div id="finance-tier-section"></div>' +
            '<div id="finance-chart-section"></div>' +
            '<div id="finance-recent-section"></div>');
    }

    _renderTierTable(tiers) {
        const $el = $('#finance-tier-section');

        if (!tiers || tiers.length === 0) {
            $el.html('<p class="admin-empty">No tier breakdown available.</p>');
            return;
        }

        const rows = tiers.map(t => {
            const tierLabel = t.tier_cad ? '$' + t.tier_cad : this._escHtml(String(t.tier || '—'));
            return `<tr>
                <td>${tierLabel}</td>
                <td>${this._formatNumber(t.count || 0)}</td>
                <td>${this._formatNectar(t.total_nt || 0)}</td>
                <td>$${parseFloat(t.total_cad || 0).toFixed(2)} CAD</td>
                <td>${this._formatNectar(t.bonus_issued || 0)}</td>
            </tr>`;
        }).join('');

        $el.html(`
            <h2 class="finance-section-title">Top-up Tier Breakdown</h2>
            <table class="admin-table" aria-label="Top-up tier breakdown">
                <thead>
                    <tr>
                        <th>Tier</th>
                        <th>Count</th>
                        <th>Total Nt</th>
                        <th>Total CAD</th>
                        <th>Bonus issued</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `);
    }

    _renderBarChart(monthlyData) {
        const $el = $('#finance-chart-section');

        if (!monthlyData || monthlyData.length === 0) {
            $el.html('');
            return;
        }

        // Use last 6 months
        const months = monthlyData.slice(-6);
        const maxRev = Math.max(...months.map(m => m.revenue_nt || m.revenue || 0), 1);

        const bars = months.map(m => {
            const rev    = m.revenue_nt || m.revenue || 0;
            const pct    = Math.round((rev / maxRev) * 100);
            const label  = this._escHtml(m.month_label || m.month || '');
            const tipVal = this._formatNectar(rev);

            return `<div class="bar-month">
                <div class="bar-fill" style="height:calc(${pct}% )" title="${tipVal}"></div>
                <span class="bar-label">${label}</span>
            </div>`;
        }).join('');

        $el.html(`
            <h2 class="finance-section-title">Monthly Revenue (last 6 months)</h2>
            <div class="bar-chart" aria-label="Monthly revenue bar chart" role="img">
                ${bars}
            </div>
        `);
    }

    _renderRecentWithdrawals(withdrawals) {
        const $el = $('#finance-recent-section');

        if (!withdrawals || withdrawals.length === 0) {
            $el.html('<h2 class="finance-section-title">Recent Withdrawal Activity</h2><p class="admin-empty">No recent paid withdrawals.</p>');
            return;
        }

        const rows = withdrawals.slice(0, 10).map(w => {
            const memberName = this._escHtml(
                (w.member && (w.member.first_name + ' ' + w.member.last_name)) ||
                w.member_name || 'Unknown'
            );
            const amount = this._formatNectar(w.amount_nt || w.amount || 0);
            const date   = w.paid_at || w.updated_at || w.created_at
                ? this._formatDate(w.paid_at || w.updated_at || w.created_at)
                : '—';

            return `<tr>
                <td>${memberName}</td>
                <td>${amount}</td>
                <td>${date}</td>
            </tr>`;
        }).join('');

        $el.html(`
            <h2 class="finance-section-title">Recent Withdrawal Activity</h2>
            <table class="admin-table" aria-label="Recent paid withdrawals">
                <thead>
                    <tr>
                        <th>Member</th>
                        <th>Amount</th>
                        <th>Date paid</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `);
    }

    // -------------------------
    // Private: helpers
    // -------------------------

    _formatNectar(n) {
        return 'Nt ' + this._formatNumber(n);
    }

    _formatNumber(n) {
        const num = parseInt(n, 10);
        if (isNaN(num)) return '0';
        return num.toLocaleString('en-CA');
    }

    _formatDate(isoString) {
        try {
            const d = new Date(isoString);
            return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (_) {
            return isoString;
        }
    }

    _escHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }
};
