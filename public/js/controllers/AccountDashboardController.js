/**
 * App.Controllers.AccountDashboardController
 * Protected member account dashboard.
 * Auth guard: redirects to /ca/login if no valid JWT.
 * Tabs: My Swarms, My Wins, Account Settings
 * Offline: reads from IndexedDB stores 'dashboard-swarms' and 'dashboard-wins'.
 */

'use strict';

App.Controllers.AccountDashboardController = class AccountDashboardController extends App.Controllers.BaseController {

    constructor() {
        super();
        this._activeTab = 'swarms';
        this._member    = null;
        this._swarms    = [];
        this._wins      = [];
        this._dbName    = 'honeycolm_dashboard';
        this._db        = null;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    async init() {
        // Auth guard — synchronous check before any rendering
        const token = localStorage.getItem('access_token');
        if (!token) {
            window.location.href = '/ca/login';
            return;
        }

        await this._openDb();
        await this.loadAll();
        this.renderShell();
    }

    // -------------------------
    // Data loading
    // -------------------------

    /**
     * Parallel fetch of member profile, swarms, and wins.
     * On failure falls back to IndexedDB cache and shows offline badge.
     */
    async loadAll() {
        const isOnline = navigator.onLine;

        if (isOnline) {
            try {
                const [profileRes, swarmsRes, winsRes] = await Promise.all([
                    this._api.get('/auth/me'),
                    this._api.get('/members/me/swarms'),
                    this._api.get('/members/me/wins'),
                ]);

                this._member = profileRes.data;
                this._swarms = swarmsRes.data || [];
                this._wins   = winsRes.data   || [];

                // Cache to IndexedDB
                await this._cacheData('dashboard-swarms', this._swarms);
                await this._cacheData('dashboard-wins',   this._wins);

            } catch (err) {
                // Network or auth error — fall back to cache
                this._swarms = await this._readCache('dashboard-swarms');
                this._wins   = await this._readCache('dashboard-wins');
                this._offlineMode = true;

                if (err.status === 401) {
                    localStorage.removeItem('access_token');
                    window.location.href = '/ca/login';
                    return;
                }

                this.showError('Could not load your data. Showing cached information.');
            }
        } else {
            // Offline — read from cache
            this._swarms     = await this._readCache('dashboard-swarms');
            this._wins       = await this._readCache('dashboard-wins');
            this._offlineMode = true;

            // Try to use cached member from localStorage
            const cached = localStorage.getItem('current_user');
            if (cached) {
                this._member = JSON.parse(cached);
            } else {
                this._member = { name: 'Member', email: '' };
            }
        }

        // Wallet total for sidebar — attempt fetch if online
        this._walletTotal = 0;
        if (isOnline && !this._offlineMode) {
            try {
                const walletRes      = await this._api.get('/wallet');
                const wallet         = walletRes.data || {};
                this._walletTotal    = (wallet.deposit_balance || 0) + (wallet.bonus_balance || 0);
            } catch (_) {
                // Non-critical — wallet display degrades gracefully
            }
        }
    }

    // -------------------------
    // Shell rendering
    // -------------------------

    renderShell() {
        const memberName  = this._member ? this._escHtml(this._member.name)  : 'Member';
        const walletTotal = this._walletTotal || 0;

        const html = `
            <div class="dashboard-layout">
                <aside class="dashboard-sidebar">
                    <div class="dashboard-user">
                        <p class="dash-name">${memberName}</p>
                        <a href="/ca/wallet" class="dash-wallet-link">Wallet &mdash; Nt&nbsp;${walletTotal}</a>
                    </div>
                    <nav class="dash-tabs" role="tablist" aria-label="Dashboard navigation">
                        <button class="dash-tab active" data-tab="swarms" role="tab" aria-selected="true">My Swarms</button>
                        <button class="dash-tab" data-tab="wins"    role="tab" aria-selected="false">My Wins</button>
                        <button class="dash-tab" data-tab="settings" role="tab" aria-selected="false">Account settings</button>
                    </nav>
                </aside>
                <main class="dashboard-content" id="dashboard-content" role="tabpanel"></main>
            </div>`;

        $('#app-root').html(html);

        // Bind tab clicks — data is already loaded, no re-fetch
        $(document).on('click.dashboard', '.dash-tab', (e) => {
            const tab = $(e.currentTarget).data('tab');
            this.renderTab(tab);
        });

        this.renderTab('swarms');
    }

    // -------------------------
    // Tab rendering
    // -------------------------

    renderTab(tab) {
        this._activeTab = tab;

        $('.dash-tab').removeClass('active').attr('aria-selected', 'false');
        $(`.dash-tab[data-tab="${tab}"]`).addClass('active').attr('aria-selected', 'true');

        switch (tab) {
            case 'swarms':   this.renderMySwarms();   break;
            case 'wins':     this.renderMyWins();     break;
            case 'settings': this.renderSettings();   break;
        }
    }

    // -------------------------
    // My Swarms tab
    // -------------------------

    renderMySwarms() {
        let content = '';

        if (this._offlineMode) {
            content += '<p class="offline-cache-badge">Showing cached data</p>';
        }

        if (!this._swarms || this._swarms.length === 0) {
            content += `<p class="empty-state">You haven't entered any Swarms yet. <a href="/ca/swarms">Browse active Swarms</a></p>`;
        } else {
            content += '<div class="entry-list">';
            for (const swarm of this._swarms) {
                const imgSrc     = (swarm.product && swarm.product.images && swarm.product.images[0])
                                    ? this._escHtml(swarm.product.images[0])
                                    : '';
                const name       = swarm.product ? this._escHtml(swarm.product.name) : 'Swarm';
                const combsHeld  = swarm.combs_held || 0;
                const odds       = this._calcOdds(swarm);
                const statusKey  = this._statusKey(swarm.status);
                const statusLabel = swarm.status_label || this._defaultStatusLabel(swarm.status);
                const deadline   = swarm.deadline ? this._countdownText(swarm.deadline) : '';

                content += `
                    <div class="entry-row">
                        <img class="entry-img" src="${imgSrc}" alt="${name}">
                        <div class="entry-info">
                            <p class="entry-name">${name}</p>
                            <p class="entry-combs">${combsHeld} Comb${combsHeld !== 1 ? 's' : ''} held &mdash; odds: ${odds}%</p>
                            ${deadline ? `<p class="entry-deadline">${deadline}</p>` : ''}
                            <span class="status-badge status-${statusKey}">${this._escHtml(statusLabel)}</span>
                        </div>
                        <div class="entry-actions">
                            <a href="/ca/swarms/${this._escHtml(String(swarm.id))}" class="btn-ghost btn-sm">View Swarm</a>
                        </div>
                    </div>`;
            }
            content += '</div>';
        }

        $('#dashboard-content').html(content);
    }

    // -------------------------
    // My Wins tab
    // -------------------------

    renderMyWins() {
        let content = '';

        if (this._offlineMode) {
            content += '<p class="offline-cache-badge">Showing cached data</p>';
        }

        if (!this._wins || this._wins.length === 0) {
            content += `<p class="empty-state">No wins yet &mdash; but every Swarm is a chance. <a href="/ca/swarms">Keep buzzing.</a></p>`;
        } else {
            content += '<div class="entry-list">';
            for (const win of this._wins) {
                const name      = win.product ? this._escHtml(win.product.name) : 'Item';
                const itemWon   = win.product ? this._escHtml(win.product.name) : '';
                const drawDate  = win.draw_date ? this._escHtml(win.draw_date)  : '';
                const verifyUrl = win.random_org_url ? this._escHtml(win.random_org_url) : '';

                content += `
                    <div class="entry-row">
                        <div class="entry-info">
                            <p class="entry-name">${name}</p>
                            ${itemWon   ? `<p class="entry-combs">Item: ${itemWon}</p>` : ''}
                            ${drawDate  ? `<p class="entry-combs">Draw date: ${drawDate}</p>` : ''}
                            ${verifyUrl ? `<a class="entry-verify" href="${verifyUrl}" target="_blank" rel="noopener">Verify on Random.org</a>` : ''}
                        </div>
                    </div>`;
            }
            content += '</div>';
        }

        $('#dashboard-content').html(content);
    }

    // -------------------------
    // Account Settings tab
    // -------------------------

    renderSettings() {
        const name  = this._member ? this._escHtml(this._member.name)  : '';
        const email = this._member ? this._escHtml(this._member.email) : '';

        const content = `
            <h2 class="settings-heading">Account settings</h2>

            <form class="settings-form" id="form-update-name" novalidate>
                <div class="form-group">
                    <label for="settings-name">Name</label>
                    <input type="text" id="settings-name" name="name" value="${name}" autocomplete="name" required>
                    <span class="field-error" id="settings-name-error"></span>
                </div>
                <div class="form-group">
                    <label for="settings-email">Email</label>
                    <input type="email" id="settings-email" name="email" value="${email}" readonly aria-readonly="true">
                    <span class="field-error" style="color:#888;font-size:12px;">Email cannot be changed.</span>
                </div>
                <button type="submit" class="btn-primary" id="btn-save-name">Save name</button>
            </form>

            <hr class="settings-divider">

            <h3 class="settings-subheading">Change password</h3>
            <form class="settings-form" id="form-change-password" novalidate>
                <div class="form-group">
                    <label for="settings-current-password">Current password</label>
                    <input type="password" id="settings-current-password" name="current_password" autocomplete="current-password" required>
                    <span class="field-error" id="settings-current-password-error"></span>
                </div>
                <div class="form-group">
                    <label for="settings-new-password">New password</label>
                    <input type="password" id="settings-new-password" name="new_password" autocomplete="new-password" required>
                    <span class="field-error" id="settings-new-password-error"></span>
                </div>
                <div class="form-group">
                    <label for="settings-confirm-password">Confirm new password</label>
                    <input type="password" id="settings-confirm-password" name="confirm_new_password" autocomplete="new-password" required>
                    <span class="field-error" id="settings-confirm-password-error"></span>
                </div>
                <button type="submit" class="btn-primary" id="btn-change-password">Change password</button>
            </form>`;

        $('#dashboard-content').html(content);

        this._bindSettingsForms();
    }

    _bindSettingsForms() {
        // --- Update name ---
        $(document).off('submit.updateName').on('submit.updateName', '#form-update-name', async (e) => {
            e.preventDefault();
            this._clearSettingsErrors();

            const name = $('#settings-name').val().trim();

            if (!name) {
                $('#settings-name-error').text('Name is required.');
                $('#settings-name').addClass('is-invalid');
                return;
            }

            this.setLoading('#btn-save-name', true);

            try {
                const res = await this._api.patch('/auth/me', { name });
                if (res.success) {
                    this._member.name = name;
                    // Update cached user
                    const cached = localStorage.getItem('current_user');
                    if (cached) {
                        const user  = JSON.parse(cached);
                        user.name   = name;
                        localStorage.setItem('current_user', JSON.stringify(user));
                    }
                    // Update sidebar name display
                    $('.dash-name').text(name);
                    this.showSuccess('Name updated.');
                }
            } catch (err) {
                const msg = (err.errors && err.errors.name) ? err.errors.name : (err.message || 'Could not save name. Please try again.');
                $('#settings-name-error').text(msg);
                $('#settings-name').addClass('is-invalid');
            } finally {
                this.setLoading('#btn-save-name', false);
            }
        });

        // --- Change password ---
        $(document).off('submit.changePassword').on('submit.changePassword', '#form-change-password', async (e) => {
            e.preventDefault();
            this._clearSettingsErrors();

            const currentPassword   = $('#settings-current-password').val();
            const newPassword       = $('#settings-new-password').val();
            const confirmNewPassword = $('#settings-confirm-password').val();

            let hasError = false;

            if (!currentPassword) {
                $('#settings-current-password-error').text('Current password is required.');
                $('#settings-current-password').addClass('is-invalid');
                hasError = true;
            }

            if (!newPassword) {
                $('#settings-new-password-error').text('New password is required.');
                $('#settings-new-password').addClass('is-invalid');
                hasError = true;
            }

            if (!confirmNewPassword) {
                $('#settings-confirm-password-error').text('Please confirm your new password.');
                $('#settings-confirm-password').addClass('is-invalid');
                hasError = true;
            }

            if (newPassword && confirmNewPassword && newPassword !== confirmNewPassword) {
                $('#settings-confirm-password-error').text('Passwords do not match.');
                $('#settings-confirm-password').addClass('is-invalid');
                hasError = true;
            }

            if (hasError) return;

            this.setLoading('#btn-change-password', true);

            try {
                const res = await this._api.post('/auth/change-password', {
                    current_password:    currentPassword,
                    new_password:        newPassword,
                    confirm_new_password: confirmNewPassword,
                });

                if (res.success) {
                    $('#form-change-password')[0].reset();
                    this.showSuccess('Password changed.');
                }
            } catch (err) {
                if (err.status === 422 && err.errors) {
                    if (err.errors.current_password) {
                        $('#settings-current-password-error').text(err.errors.current_password);
                        $('#settings-current-password').addClass('is-invalid');
                    }
                    if (err.errors.new_password) {
                        $('#settings-new-password-error').text(err.errors.new_password);
                        $('#settings-new-password').addClass('is-invalid');
                    }
                    if (err.errors.confirm_new_password) {
                        $('#settings-confirm-password-error').text(err.errors.confirm_new_password);
                        $('#settings-confirm-password').addClass('is-invalid');
                    }
                } else {
                    this.showError(err.message || 'Could not change password. Please try again.');
                }
            } finally {
                this.setLoading('#btn-change-password', false);
            }
        });
    }

    // -------------------------
    // Destroy — unbind delegated events
    // -------------------------

    destroy() {
        $(document).off('click.dashboard');
        $(document).off('submit.updateName');
        $(document).off('submit.changePassword');
    }

    // -------------------------
    // IndexedDB helpers
    // -------------------------

    _openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, 1);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('dashboard-swarms')) {
                    db.createObjectStore('dashboard-swarms', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('dashboard-wins')) {
                    db.createObjectStore('dashboard-wins', { keyPath: 'id' });
                }
            };

            req.onsuccess = (e) => {
                this._db = e.target.result;
                resolve();
            };

            req.onerror = () => reject(req.error);
        });
    }

    _cacheData(storeName, items) {
        return new Promise((resolve, reject) => {
            if (!this._db || !Array.isArray(items) || items.length === 0) {
                resolve();
                return;
            }

            const tx    = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            // Clear existing cache then add fresh data
            const clearReq = store.clear();
            clearReq.onsuccess = () => {
                let pending = items.length;
                if (pending === 0) { resolve(); return; }

                for (const item of items) {
                    const addReq = store.add(item);
                    addReq.onsuccess = () => { pending--; if (pending === 0) resolve(); };
                    addReq.onerror   = () => { pending--; if (pending === 0) resolve(); };
                }
            };
            clearReq.onerror = () => reject(clearReq.error);
        });
    }

    _readCache(storeName) {
        return new Promise((resolve) => {
            if (!this._db) { resolve([]); return; }

            const tx  = this._db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => resolve([]);
        });
    }

    // -------------------------
    // Utility helpers
    // -------------------------

    /**
     * Calculate member odds as a percentage.
     * Uses member_odds if provided, otherwise computes from combs_held / comb_count.
     */
    _calcOdds(swarm) {
        if (swarm.member_odds !== undefined && swarm.member_odds !== null) {
            return parseFloat(swarm.member_odds).toFixed(1);
        }
        const combCount  = swarm.comb_count  || swarm.total_combs || 1;
        const combsHeld  = swarm.combs_held  || 0;
        return ((combsHeld / combCount) * 100).toFixed(1);
    }

    /**
     * Map status string to CSS-safe key.
     */
    _statusKey(status) {
        const map = {
            'active':         'active',
            'filling_fast':   'filling-fast',
            'full':           'full',
            'draw_complete':  'draw-complete',
            'expired':        'expired',
            'cancelled':      'cancelled',
            'draft':          'draft',
        };
        return map[status] || 'active';
    }

    _defaultStatusLabel(status) {
        const labels = {
            'active':        'Active',
            'filling_fast':  'Filling Fast',
            'full':          'Full',
            'draw_complete': 'Draw Complete',
            'expired':       'Expired',
            'cancelled':     'Cancelled',
            'draft':         'Draft',
        };
        return labels[status] || status || 'Active';
    }

    _countdownText(deadline) {
        const diff = new Date(deadline) - Date.now();
        if (diff <= 0) return 'Deadline passed';

        const days    = Math.floor(diff / 86400000);
        const hours   = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000)  / 60000);

        if (days > 0)  return `${days}d ${hours}h remaining`;
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    }

    /**
     * Escape HTML special characters to prevent XSS.
     */
    _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _clearSettingsErrors() {
        $('.field-error').text('');
        $('input').removeClass('is-invalid');
    }
};
