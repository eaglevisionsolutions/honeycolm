/**
 * App.Controllers.AccountDashboardController
 * Protected member account dashboard: entered swarms, win history, account settings.
 * Auth guard redirects to /ca/login if no JWT.
 * Caches entered swarms in IndexedDB for offline reads.
 */

'use strict';

App.Controllers.AccountDashboardController = class AccountDashboardController extends App.Controllers.BaseController {

    constructor() {
        super();
        /** @type {Object|null} User profile */
        this._profile = null;
        /** @type {Array} Entered swarms */
        this._swarms = [];
        /** @type {Array} Win history */
        this._wins = [];
        /** @type {IDBDatabase|null} */
        this._db = null;
        /** @type {string} Active tab */
        this._activeTab = 'swarms';
        /** @type {boolean} Whether showing cached data */
        this._offlineMode = false;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    async init() {
        // Auth guard
        if (!this._auth.isLoggedIn()) {
            window.location.href = '/ca/login';
            return;
        }

        App.Utils.SEO.setPageMeta({
            title:  'My Account — Honeycolm',
            robots: 'noindex, nofollow',
        });

        $('#app-root').html(
            '<div class="page-loading"><span class="spinner"></span> Loading your account&hellip;</div>'
        );

        await this._openDb();
        await this._loadAll();
        this._renderPage();
    }

    destroy() {
        $(document).off('click.accountTab');
        $(document).off('submit.profileForm');
        $(document).off('submit.passwordForm');
        $(document).off('click.accountLogout');
    }

    // -------------------------
    // Data loading
    // -------------------------

    async _loadAll() {
        if (!navigator.onLine) {
            this._swarms = await this._readCache('account-swarms');
            this._wins = [];
            this._profile = this._auth.currentUser();
            this._offlineMode = true;
            return;
        }

        try {
            const [swarmsRes, winsRes, profileRes] = await Promise.allSettled([
                this._api.get('/account/swarms'),
                this._api.get('/account/wins'),
                this._api.get('/account/profile'),
            ]);

            if (swarmsRes.status === 'fulfilled') {
                this._swarms = swarmsRes.value.data || [];
                await this._cacheData('account-swarms', this._swarms);
            } else {
                this._swarms = await this._readCache('account-swarms');
                this._offlineMode = true;
            }

            this._wins = winsRes.status === 'fulfilled' ? (winsRes.value.data || []) : [];

            if (profileRes.status === 'fulfilled') {
                this._profile = profileRes.value.data || null;
            } else {
                this._profile = this._auth.currentUser();
            }
        } catch (err) {
            if (err.status === 401) {
                this._auth.logout();
                window.location.href = '/ca/login';
                return;
            }
            this._swarms = await this._readCache('account-swarms');
            this._wins = [];
            this._profile = this._auth.currentUser();
            this._offlineMode = true;
        }
    }

    // -------------------------
    // Rendering
    // -------------------------

    _renderPage() {
        const memberName = this._profile ? this._esc(this._profile.name) : 'Member';

        let html = '<div class="account-page container">';
        html += `<h1 class="account-page__title">Welcome back, ${memberName}</h1>`;

        if (this._offlineMode) {
            html += '<p class="offline-cache-badge">Showing cached data — some information may be outdated.</p>';
        }

        // Tab navigation
        html += '<div class="account-tabs">';
        html += this._tabBtn('swarms', 'My Swarms');
        html += this._tabBtn('wins', 'Win History');
        html += this._tabBtn('settings', 'Account Settings');
        html += '</div>';

        // Tab content
        html += '<div class="account-tab-content" id="account-tab-content">';
        html += this._renderActiveTab();
        html += '</div>';

        html += '</div>';

        $('#app-root').html(html);
        this._bindEvents();
    }

    _tabBtn(id, label) {
        const active = this._activeTab === id ? ' account-tabs__btn--active' : '';
        return `<button class="account-tabs__btn${active}" data-tab="${id}">${label}</button>`;
    }

    _renderActiveTab() {
        switch (this._activeTab) {
            case 'swarms':   return this._renderSwarmsTab();
            case 'wins':     return this._renderWinsTab();
            case 'settings': return this._renderSettingsTab();
            default:         return '';
        }
    }

    // ---- Swarms tab ----

    _renderSwarmsTab() {
        if (!this._swarms || this._swarms.length === 0) {
            return `<div class="account-empty">
                <p class="empty-state">You haven't entered any Swarms yet.</p>
                <a href="/ca/swarms" class="btn-primary mt-1">Browse Active Swarms</a>
            </div>`;
        }

        let html = '<div class="account-swarms">';

        for (const swarm of this._swarms) {
            const combsHeld = parseInt(swarm.combs_held, 10) || 0;
            const combCount = parseInt(swarm.comb_count, 10) || 0;
            const combsSold = parseInt(swarm.combs_sold, 10) || 0;
            const odds = parseFloat(swarm.member_odds || 0).toFixed(1);
            const fillPct = combCount > 0 ? Math.min(100, Math.round((combsSold / combCount) * 100)) : 0;
            const imgSrc = swarm.primary_image || '';
            const title = swarm.product_name || swarm.title || 'Swarm';
            const deadline = swarm.deadline ? this._countdownText(swarm.deadline) : '';
            const statusBadge = this._statusBadge(swarm.status);

            html += `<a href="/ca/swarms/${swarm.id}" class="account-swarm-card">`;

            if (imgSrc) {
                html += `<div class="account-swarm-card__img"><img src="${this._esc(imgSrc)}" alt="${this._esc(title)}"></div>`;
            } else {
                html += '<div class="account-swarm-card__img account-swarm-card__img--placeholder"></div>';
            }

            html += '<div class="account-swarm-card__body">';
            html += `<h3 class="account-swarm-card__title">${this._esc(title)}</h3>`;
            html += `<div class="account-swarm-card__meta">${statusBadge}`;
            if (deadline) html += ` <span class="account-swarm-card__deadline">${deadline}</span>`;
            html += '</div>';
            html += '<div class="account-swarm-card__stats">';
            html += `<span>${combsHeld} Comb${combsHeld !== 1 ? 's' : ''} held</span>`;
            html += `<span>Your odds: ${odds}%</span>`;
            html += '</div>';
            html += `<div class="progress-bar-track progress-bar-track--sm"><div class="progress-bar-fill" style="width:${fillPct}%;"></div></div>`;
            html += `<div class="account-swarm-card__fill">${fillPct}% filled</div>`;
            html += '</div></a>';
        }

        html += '</div>';
        return html;
    }

    // ---- Wins tab ----

    _renderWinsTab() {
        if (!this._wins || this._wins.length === 0) {
            return `<div class="account-empty">
                <p class="empty-state">No wins yet — but every Swarm is a chance!</p>
                <a href="/ca/swarms" class="btn-primary mt-1">Keep Buzzing</a>
            </div>`;
        }

        let html = '<div class="account-wins">';

        for (const win of this._wins) {
            const imgSrc = win.primary_image || '';
            const title = win.product_name || win.swarm_title || 'Item';
            const drawnDate = win.drawn_at
                ? new Date(win.drawn_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
                : '';

            html += '<div class="account-win-card">';
            if (imgSrc) {
                html += `<div class="account-win-card__img"><img src="${this._esc(imgSrc)}" alt="${this._esc(title)}"></div>`;
            }
            html += '<div class="account-win-card__body">';
            html += `<h3 class="account-win-card__title">${this._esc(title)}</h3>`;
            if (win.retail_value) {
                html += `<p class="account-win-card__retail">Retail value: $${parseFloat(win.retail_value).toFixed(2)}</p>`;
            }
            if (drawnDate) {
                html += `<p class="account-win-card__date">Won on ${drawnDate}</p>`;
            }
            if (win.shipping_status) {
                html += `<p class="account-win-card__shipping">${this._shippingBadge(win.shipping_status)}</p>`;
            }
            if (win.random_org_verify_url) {
                html += `<p><a href="${this._esc(win.random_org_verify_url)}" target="_blank" rel="noopener" class="account-win-card__verify">Verify on Random.org</a></p>`;
            }
            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    // ---- Settings tab ----

    _renderSettingsTab() {
        const user = this._profile || {};
        const name = this._esc(user.name || '');
        const email = this._esc(user.email || '');

        let html = '<div class="account-settings">';

        // Profile form
        html += '<div class="account-settings__section">';
        html += '<h3 class="account-settings__heading">Profile Information</h3>';
        html += '<form id="profile-form" class="account-form" novalidate>';
        html += `<div class="form-group">
            <label for="profile-name">Name</label>
            <input type="text" id="profile-name" value="${name}" class="form-input" required minlength="2" maxlength="100">
            <span class="field-error" id="profile-name-error"></span>
        </div>`;
        html += `<div class="form-group">
            <label for="profile-email">Email</label>
            <input type="email" id="profile-email" value="${email}" class="form-input" required>
            <span class="field-error" id="profile-email-error"></span>
        </div>`;
        html += '<button type="submit" class="btn-primary" id="btn-save-profile">Save Changes</button>';
        html += '</form></div>';

        // Password form
        html += '<div class="account-settings__section">';
        html += '<h3 class="account-settings__heading">Change Password</h3>';
        html += '<form id="password-form" class="account-form" novalidate>';
        html += `<div class="form-group">
            <label for="current-password">Current Password</label>
            <input type="password" id="current-password" class="form-input" autocomplete="current-password" required>
            <span class="field-error" id="current-password-error"></span>
        </div>`;
        html += `<div class="form-group">
            <label for="new-password">New Password</label>
            <input type="password" id="new-password" class="form-input" autocomplete="new-password" required minlength="8">
            <span class="field-error" id="new-password-error"></span>
        </div>`;
        html += `<div class="form-group">
            <label for="confirm-password">Confirm New Password</label>
            <input type="password" id="confirm-password" class="form-input" autocomplete="new-password" required>
            <span class="field-error" id="confirm-password-error"></span>
        </div>`;
        html += '<button type="submit" class="btn-primary" id="btn-change-password">Change Password</button>';
        html += '</form></div>';

        // Logout
        html += '<div class="account-settings__section account-settings__section--logout">';
        html += '<button class="btn-ghost btn-ghost--danger" id="btn-logout">Log Out</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // -------------------------
    // Events
    // -------------------------

    _bindEvents() {
        const self = this;

        // Tab switching
        $(document).off('click.accountTab').on('click.accountTab', '.account-tabs__btn', function () {
            self._activeTab = $(this).data('tab');
            $('.account-tabs__btn').removeClass('account-tabs__btn--active');
            $(this).addClass('account-tabs__btn--active');
            $('#account-tab-content').html(self._renderActiveTab());
            self._bindFormEvents();
        });

        this._bindFormEvents();
    }

    _bindFormEvents() {
        const self = this;

        // Profile form
        $(document).off('submit.profileForm').on('submit.profileForm', '#profile-form', function (e) {
            e.preventDefault();
            self._onSaveProfile();
        });

        // Password form
        $(document).off('submit.passwordForm').on('submit.passwordForm', '#password-form', function (e) {
            e.preventDefault();
            self._onChangePassword();
        });

        // Logout
        $(document).off('click.accountLogout').on('click.accountLogout', '#btn-logout', function () {
            self._auth.logout();
            window.location.href = '/';
        });
    }

    // -------------------------
    // Actions
    // -------------------------

    async _onSaveProfile() {
        this._clearErrors();
        const name  = $('#profile-name').val().trim();
        const email = $('#profile-email').val().trim();

        let hasError = false;
        if (!name || name.length < 2) {
            $('#profile-name-error').text('Name must be at least 2 characters.');
            hasError = true;
        }
        if (!email || !email.includes('@')) {
            $('#profile-email-error').text('Please enter a valid email.');
            hasError = true;
        }
        if (hasError) return;

        this.setLoading('#btn-save-profile', true);

        try {
            const result = await this._api.put('/account/profile', { name, email });
            this._profile = result.data;
            localStorage.setItem('current_user', JSON.stringify(result.data));
            this.showSuccess('Profile updated successfully.');
        } catch (err) {
            if (err.errors) {
                if (err.errors.name)  $('#profile-name-error').text(err.errors.name);
                if (err.errors.email) $('#profile-email-error').text(err.errors.email);
            } else {
                this.showError(err.message || 'Failed to update profile.');
            }
        } finally {
            this.setLoading('#btn-save-profile', false);
        }
    }

    async _onChangePassword() {
        this._clearErrors();
        const current = $('#current-password').val();
        const newPass = $('#new-password').val();
        const confirm = $('#confirm-password').val();

        let hasError = false;
        if (!current) {
            $('#current-password-error').text('Current password is required.');
            hasError = true;
        }
        if (!newPass || newPass.length < 8) {
            $('#new-password-error').text('New password must be at least 8 characters.');
            hasError = true;
        }
        if (newPass !== confirm) {
            $('#confirm-password-error').text('Passwords do not match.');
            hasError = true;
        }
        if (hasError) return;

        this.setLoading('#btn-change-password', true);

        try {
            await this._api.put('/account/password', {
                current_password: current,
                new_password: newPass,
                confirm_password: confirm,
            });

            this.showSuccess('Password changed successfully.');
            $('#password-form')[0].reset();
        } catch (err) {
            if (err.errors) {
                if (err.errors.current_password) $('#current-password-error').text(err.errors.current_password);
                if (err.errors.new_password) $('#new-password-error').text(err.errors.new_password);
                if (err.errors.confirm_password) $('#confirm-password-error').text(err.errors.confirm_password);
            } else {
                this.showError(err.message || 'Failed to change password.');
            }
        } finally {
            this.setLoading('#btn-change-password', false);
        }
    }

    _clearErrors() {
        $('.field-error').text('');
    }

    // -------------------------
    // Helpers
    // -------------------------

    _statusBadge(status) {
        const labels = {
            active: 'Active', filling_fast: 'Filling Fast', full: 'Full',
            draw_complete: 'Draw Complete', shipped: 'Shipped',
            expired: 'Expired', cancelled: 'Cancelled',
        };
        const classes = {
            active: 'badge--active', filling_fast: 'badge--filling-fast',
            full: 'badge--full', draw_complete: 'badge--draw-complete',
            shipped: 'badge--draw-complete', expired: 'badge--expired',
            cancelled: 'badge--cancelled',
        };
        return `<span class="badge ${classes[status] || 'badge--active'}">${labels[status] || status}</span>`;
    }

    _shippingBadge(status) {
        const map = {
            pending:   '<span class="badge badge--draft">Shipping Pending</span>',
            shipped:   '<span class="badge badge--active">Shipped</span>',
            delivered: '<span class="badge badge--draw-complete">Delivered</span>',
        };
        return map[status] || `<span class="badge badge--draft">${this._esc(status)}</span>`;
    }

    _countdownText(deadline) {
        const diff = new Date(deadline) - Date.now();
        if (diff <= 0) return 'Deadline passed';
        const days    = Math.floor(diff / 86400000);
        const hours   = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        if (days > 0) return `${days}d ${hours}h remaining`;
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    }

    _esc(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // -------------------------
    // IndexedDB cache
    // -------------------------

    _openDb() {
        if (this._db) return Promise.resolve(this._db);

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('honeycolm', 3);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('swarms-cache')) {
                    db.createObjectStore('swarms-cache');
                }
                if (!db.objectStoreNames.contains('swarm-detail-cache')) {
                    db.createObjectStore('swarm-detail-cache');
                }
                if (!db.objectStoreNames.contains('account-swarms')) {
                    db.createObjectStore('account-swarms');
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = () => reject(request.error);
        });
    }

    async _cacheData(storeName, data) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx    = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                store.put(data, 'data');
                tx.oncomplete = () => resolve();
                tx.onerror    = () => reject(tx.error);
            });
        } catch (e) { /* non-critical */ }
    }

    async _readCache(storeName) {
        try {
            const db = await this._openDb();
            return await new Promise((resolve, reject) => {
                const tx    = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req   = store.get('data');
                req.onsuccess = () => resolve(req.result || []);
                req.onerror   = () => reject(req.error);
            });
        } catch (e) {
            return [];
        }
    }
};
