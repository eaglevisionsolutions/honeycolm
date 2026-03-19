/**
 * App.Admin.Controllers.DashboardController
 * Renders the admin dashboard into #admin-root.
 *
 * Sections:
 *  - Stat cards: platform overview numbers
 *  - Active Swarms table: per-swarm progress at a glance
 *  - Recent Activity feed: last 20 platform events
 *
 * Auto-refreshes stat cards and swarms table every 60 seconds.
 * Uses admin JWT via App.Admin.AuthService.getToken().
 * Admin panel has no service worker — no offline queue needed.
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};

App.Admin.Controllers.DashboardController = class DashboardController {

    constructor() {
        this._refreshTimer = null;
    }

    // -------------------------
    // Public API
    // -------------------------

    /**
     * Initialise the dashboard controller.
     * Renders the page skeleton, loads data, then sets the 60-second refresh.
     */
    init() {
        this._renderSkeleton();
        this.loadDashboard();
        this._refreshTimer = setInterval(() => this.loadDashboard(), 60000);
    }

    /**
     * Fetch all dashboard data from the API and render each section.
     * On error shows an inline error message without wiping the page.
     * @returns {Promise<void>}
     */
    async loadDashboard() {
        const token = App.Admin.AuthService.getToken();

        let data;
        try {
            const response = await fetch('/api/v1/admin/dashboard', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + token
                }
            });

            let body;
            try {
                body = await response.json();
            } catch (_) {
                throw new Error('Server returned an unexpected response.');
            }

            if (!response.ok || !body.success) {
                const message = (body && body.message)
                    ? body.message
                    : 'Failed to load dashboard data.';
                throw new Error(message);
            }

            data = body.data;

        } catch (err) {
            this._showError(err.message || 'Could not connect to the server. Please refresh.');
            return;
        }

        // Render each section — activity feed only refreshed on first load
        // to avoid scroll position jumping during auto-refresh
        const isFirstLoad = !document.querySelector('.stats-grid');

        this.renderStats(data.stats || {});
        this.renderSwarmsTable(data.active_swarms || []);

        if (isFirstLoad) {
            this.renderActivityFeed(data.recent_activity || []);
        }
    }

    // -------------------------
    // Render: stat cards
    // -------------------------

    /**
     * Renders the four stat cards into #dashboard-stats.
     * @param {Object} stats
     */
    renderStats(stats) {
        const el = document.getElementById('dashboard-stats');
        if (!el) return;

        const totalMembers       = this._formatNumber(stats.total_members        || stats.new_members        || 0);
        const activeSwarms       = this._formatNumber(stats.active_swarms        || 0);
        const nectarCirculation  = this._formatNectar(stats.nectar_in_circulation || stats.total_nectar       || 0);
        const pendingWithdrawals = this._formatNumber(stats.pending_withdrawals   || stats.pending_wd         || 0);

        el.innerHTML = [
            this._statCard('Total members',         totalMembers,      ''),
            this._statCard('Active Swarms',         activeSwarms,      ''),
            this._statCard('Nectar in circulation', nectarCirculation, ''),
            this._statCard('Pending withdrawals',   pendingWithdrawals, pendingWithdrawals !== '0' ? 'Needs Action' : '')
        ].join('');
    }

    // -------------------------
    // Render: active swarms table
    // -------------------------

    /**
     * Renders the active swarms table into #dashboard-swarms.
     * @param {Array} swarms
     */
    renderSwarmsTable(swarms) {
        const el = document.getElementById('dashboard-swarms');
        if (!el) return;

        if (!swarms || swarms.length === 0) {
            el.innerHTML = '<p class="dashboard-empty">No active Swarms right now.</p>';
            return;
        }

        const rows = swarms.map((swarm) => {
            const id          = swarm.id          || '';
            const name        = this._escHtml(swarm.product_name || swarm.name || 'Unnamed Swarm');
            const combsSold   = this._formatNumber(swarm.combs_sold || 0);
            const combCount   = swarm.comb_count  || swarm.total_combs || 0;
            const remaining   = this._formatNumber(Math.max(0, combCount - (swarm.combs_sold || 0)));
            const fillPct     = combCount > 0
                ? Math.min(100, Math.round(((swarm.combs_sold || 0) / combCount) * 100))
                : 0;
            const deadline    = swarm.deadline    ? this._formatDate(swarm.deadline) : '—';
            const marginPct   = swarm.margin_pct  !== undefined ? swarm.margin_pct + '%' : '—';
            const status      = swarm.status      || 'active';
            const badgeHtml   = this._statusBadge(status);
            const href        = id ? '/admin/swarms/' + id : '#';

            return `<tr>
                <td><a class="swarm-link" href="${href}">${name}</a></td>
                <td>${combsSold}</td>
                <td>
                    <div class="mini-progress" title="${fillPct}% filled">
                        <div class="mini-progress-fill" style="width:${fillPct}%"></div>
                    </div>
                    <span class="mini-progress-label">${fillPct}%</span>
                </td>
                <td>${remaining}</td>
                <td>${deadline}</td>
                <td>${marginPct}</td>
                <td>${badgeHtml}</td>
            </tr>`;
        }).join('');

        el.innerHTML = `
            <table class="admin-table" aria-label="Active Swarms">
                <thead>
                    <tr>
                        <th>Swarm</th>
                        <th>Combs sold</th>
                        <th>% Filled</th>
                        <th>Remaining</th>
                        <th>Deadline</th>
                        <th>Margin</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // -------------------------
    // Render: activity feed
    // -------------------------

    /**
     * Renders the recent activity feed into #dashboard-activity.
     * Events are displayed in reverse chronological order (API should return
     * them newest-first; this method renders them as-is).
     * @param {Array} events
     */
    renderActivityFeed(events) {
        const el = document.getElementById('dashboard-activity');
        if (!el) return;

        if (!events || events.length === 0) {
            el.innerHTML = '<p class="dashboard-empty">No recent activity.</p>';
            return;
        }

        const items = events.map((event) => {
            const ts   = event.created_at || event.timestamp || '';
            const desc = this._escHtml(event.description || event.message || '');
            const timeLabel = ts ? this._formatRelativeTime(ts) : '';

            return `<li class="feed-item">
                <time datetime="${this._escHtml(ts)}">${timeLabel}</time>
                <span>${desc}</span>
            </li>`;
        }).join('');

        el.innerHTML = `<ul class="activity-feed" aria-label="Recent activity">${items}</ul>`;
    }

    // -------------------------
    // Private: page skeleton
    // -------------------------

    /**
     * Renders the static page scaffold into #admin-root before data arrives.
     * Placeholders allow CSS loading shimmer if desired.
     */
    _renderSkeleton() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = `
            <div class="dashboard-header">
                <h1 class="dashboard-title">Dashboard</h1>
                <span class="dashboard-refresh-note" id="dashboard-refresh-note"></span>
            </div>

            <!-- Stat cards -->
            <div class="stats-grid" id="dashboard-stats" aria-label="Platform overview">
                ${this._loadingCard()}
                ${this._loadingCard()}
                ${this._loadingCard()}
                ${this._loadingCard()}
            </div>

            <!-- Main body: swarms table + activity feed -->
            <div class="dashboard-body">

                <section class="dashboard-swarms-section" aria-label="Active Swarms">
                    <div class="dashboard-section-header">
                        <h2 class="dashboard-section-title">Active Swarms</h2>
                        <a href="/admin/swarms.html" class="dashboard-view-all">View all</a>
                    </div>
                    <div id="dashboard-swarms" class="dashboard-swarms-wrap">
                        <p class="dashboard-loading">Loading&hellip;</p>
                    </div>
                </section>

                <section class="dashboard-activity-section" aria-label="Recent Activity">
                    <h2 class="dashboard-section-title">Recent Activity</h2>
                    <div id="dashboard-activity">
                        <p class="dashboard-loading">Loading&hellip;</p>
                    </div>
                </section>

            </div>`;
    }

    // -------------------------
    // Private: helpers
    // -------------------------

    /**
     * Build a single stat card HTML string.
     * @param {string} label
     * @param {string} value
     * @param {string} sub   - Optional sub-label (e.g. "Needs Action")
     * @returns {string}
     */
    _statCard(label, value, sub) {
        const subHtml = sub ? `<div class="stat-sub">${this._escHtml(sub)}</div>` : '';
        return `<div class="stat-card">
            <div class="stat-label">${this._escHtml(label)}</div>
            <div class="stat-value">${value}</div>
            ${subHtml}
        </div>`;
    }

    /**
     * Render a loading placeholder card while data is fetched.
     * @returns {string}
     */
    _loadingCard() {
        return `<div class="stat-card stat-card--loading" aria-hidden="true">
            <div class="stat-label">&nbsp;</div>
            <div class="stat-value">&mdash;</div>
        </div>`;
    }

    /**
     * Build a status badge HTML string using brand colours.
     * Statuses: active, filling_fast, full, draw_complete, draft, expired, cancelled
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
            'cancelled':     'badge--cancelled'
        };
        const cls   = map[status] || 'badge--active';
        const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        return `<span class="status-badge ${cls}">${this._escHtml(label)}</span>`;
    }

    /**
     * Show an inline error inside #dashboard-stats (first visible section).
     * Does not clear the swarms or activity sections if they already rendered.
     * @param {string} message
     */
    _showError(message) {
        const el = document.getElementById('dashboard-stats');
        if (!el) return;
        el.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(message)}</div>`;
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
     * Format a Nectar value with the Nt prefix and thousand separators.
     * e.g. 45800 → "Nt 45,800"
     * @param {number} n
     * @returns {string}
     */
    _formatNectar(n) {
        return 'Nt ' + this._formatNumber(n);
    }

    /**
     * Format an ISO date string to a short human-readable date.
     * e.g. "2026-04-15T00:00:00Z" → "Apr 15, 2026"
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
     * Format an ISO timestamp as a relative time label.
     * e.g. "2 mins ago", "5 hours ago", "Yesterday"
     * @param {string} isoString
     * @returns {string}
     */
    _formatRelativeTime(isoString) {
        try {
            const now   = Date.now();
            const then  = new Date(isoString).getTime();
            const diffMs = now - then;

            const mins  = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMs / 3600000);
            const days  = Math.floor(diffMs / 86400000);

            if (mins < 1)   return 'Just now';
            if (mins < 60)  return mins + ' min' + (mins === 1 ? '' : 's') + ' ago';
            if (hours < 24) return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
            if (days === 1) return 'Yesterday';
            return days + ' days ago';
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
