/**
 * App.Admin.Controllers.SettingsController
 * Renders the admin settings page into #admin-root.
 *
 * Sections:
 *  - Staff management: list, add, activate/deactivate
 *  - Regions: Canada (locked), United States toggle, default region select
 *  - Random.org: API key management and connection test
 *  - Platform config: margin warning threshold, filling fast threshold
 *
 * Uses this._api for all API calls.
 * Uses jQuery $ for DOM manipulation and event binding.
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};

App.Admin.Controllers.SettingsController = class SettingsController {

    constructor(api) {
        this._api            = api;
        this._settings       = null;
        this._staff          = [];
        this._currentStaffId = null;
    }

    // -------------------------
    // Public API
    // -------------------------

    /**
     * Initialise the settings controller.
     * Parses the JWT from localStorage to identify the current user,
     * loads all data in parallel, then renders the page shell.
     * @returns {Promise<void>}
     */
    async init() {
        this._parseCurrentStaffId();

        try {
            await Promise.all([
                this._loadSettings(),
                this._loadStaff()
            ]);
        } catch (err) {
            this._showRootError(err.message || 'Failed to load settings data.');
            return;
        }

        this.renderShell();
    }

    /**
     * Renders the four-card settings grid into #admin-root,
     * then populates each card by calling each render sub-method.
     */
    renderShell() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        root.innerHTML = `
            <div class="settings-header">
                <h1 class="settings-title">Settings</h1>
            </div>

            <div class="settings-grid">

                <div class="settings-card" id="settings-staff">
                    <h2 class="settings-card-title">Staff</h2>
                    <div class="settings-card-body" id="settings-staff-body">
                        <p class="settings-loading">Loading&hellip;</p>
                    </div>
                </div>

                <div class="settings-card" id="settings-regions">
                    <h2 class="settings-card-title">Regions</h2>
                    <div class="settings-card-body" id="settings-regions-body">
                        <p class="settings-loading">Loading&hellip;</p>
                    </div>
                </div>

                <div class="settings-card" id="settings-randomorg">
                    <h2 class="settings-card-title">Random.org</h2>
                    <div class="settings-card-body" id="settings-randomorg-body">
                        <p class="settings-loading">Loading&hellip;</p>
                    </div>
                </div>

                <div class="settings-card" id="settings-platform">
                    <h2 class="settings-card-title">Platform Config</h2>
                    <div class="settings-card-body" id="settings-platform-body">
                        <p class="settings-loading">Loading&hellip;</p>
                    </div>
                </div>

            </div>`;

        this.renderStaffSection();
        this.renderRegionsSection();
        this.renderRandomOrgSection();
        this.renderPlatformSection();
    }

    // -------------------------
    // Render: staff section
    // -------------------------

    /**
     * Renders the staff table and "Add staff member" button into #settings-staff-body.
     * Marks the current user's row and hides the deactivate button for them.
     * Binds all staff-related actions.
     */
    renderStaffSection() {
        const el = document.getElementById('settings-staff-body');
        if (!el) return;

        const currentUser = this._staff.find(s => s.id === this._currentStaffId);
        const isSuperAdmin = currentUser && currentUser.role === 'super_admin';

        const rows = this._staff.map((member) => {
            const isMe      = member.id === this._currentStaffId;
            const isActive  = member.is_active !== 0;
            const roleLabel = this._formatRole(member.role || '');
            const roleClass = this._roleClass(member.role || '');

            const youBadge  = isMe
                ? `<span class="staff-badge-you">You</span>`
                : '';

            const actionBtn = isMe
                ? ''
                : isActive
                    ? `<button class="btn btn--sm btn--danger js-staff-deactivate" data-id="${member.id}">Deactivate</button>`
                    : `<button class="btn btn--sm btn--secondary js-staff-reactivate" data-id="${member.id}">Reactivate</button>`;

            const statusLabel = isActive
                ? `<span class="status-badge badge--active">Active</span>`
                : `<span class="status-badge badge--cancelled">Inactive</span>`;

            return `<tr class="${isMe ? 'staff-row--me' : ''}">
                <td>${this._escHtml(member.name || '')} ${youBadge}</td>
                <td>${this._escHtml(member.email || '')}</td>
                <td><span class="role-badge ${roleClass}">${this._escHtml(roleLabel)}</span></td>
                <td>${statusLabel}</td>
                <td class="staff-actions">${actionBtn}</td>
            </tr>`;
        }).join('');

        const superAdminOption = isSuperAdmin
            ? `<option value="super_admin">Super Admin</option>`
            : '';

        el.innerHTML = `
            <table class="admin-table staff-table" aria-label="Staff members">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5">No staff found.</td></tr>'}</tbody>
            </table>

            <div class="settings-actions">
                <button class="btn btn--primary js-staff-add-toggle" id="btn-add-staff">
                    + Add staff member
                </button>
            </div>

            <div class="add-staff-form" id="add-staff-form" style="display:none;">
                <h3 class="add-staff-form-title">New Staff Member</h3>
                <div class="form-group">
                    <label for="staff-name">Name</label>
                    <input type="text" id="staff-name" class="form-control" placeholder="Full name" />
                </div>
                <div class="form-group">
                    <label for="staff-email">Email</label>
                    <input type="text" id="staff-email" class="form-control" placeholder="email@example.com" />
                </div>
                <div class="form-group">
                    <label for="staff-password">Password</label>
                    <input type="password" id="staff-password" class="form-control" placeholder="Temporary password" />
                </div>
                <div class="form-group">
                    <label for="staff-role">Role</label>
                    <select id="staff-role" class="form-control">
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                        ${superAdminOption}
                    </select>
                </div>
                <div class="add-staff-form-actions">
                    <button class="btn btn--primary js-staff-submit">Create staff member</button>
                    <button class="btn btn--ghost js-staff-cancel">Cancel</button>
                </div>
                <div class="add-staff-error" id="add-staff-error" role="alert" style="display:none;"></div>
            </div>`;

        this._bindStaffEvents();
    }

    // -------------------------
    // Render: regions section
    // -------------------------

    /**
     * Renders the regions section into #settings-regions-body.
     * Canada is always active (locked). US has a live toggle.
     * Default region select is saved separately.
     */
    renderRegionsSection() {
        const el = document.getElementById('settings-regions-body');
        if (!el) return;

        const s = this._settings || {};
        const usActive       = s.us_region_active      ? 'checked' : '';
        const defaultRegion  = s.com_default_region     || 'ca';

        el.innerHTML = `
            <div class="region-list">

                <div class="region-row region-row--locked">
                    <span class="region-flag">&#127464;&#127462;</span>
                    <span class="region-name">Canada</span>
                    <span class="region-status-locked">Always active</span>
                </div>

                <div class="region-row">
                    <span class="region-flag">&#127482;&#127480;</span>
                    <span class="region-name">United States</span>
                    <label class="toggle-switch" aria-label="United States region toggle">
                        <input type="checkbox" id="toggle-us-region" class="toggle-input js-us-region-toggle" ${usActive} />
                        <span class="toggle-slider"></span>
                    </label>
                </div>

            </div>

            <div class="form-group settings-default-region">
                <label for="select-default-region">Default region for .com</label>
                <select id="select-default-region" class="form-control">
                    <option value="ca" ${defaultRegion === 'ca' ? 'selected' : ''}>Canada (ca)</option>
                    <option value="us" ${defaultRegion === 'us' ? 'selected' : ''}>United States (us)</option>
                </select>
            </div>

            <div class="settings-actions">
                <button class="btn btn--primary js-regions-save">Save region settings</button>
            </div>
            <div class="settings-feedback" id="regions-feedback" role="alert" style="display:none;"></div>`;

        this._bindRegionsEvents();
    }

    // -------------------------
    // Render: Random.org section
    // -------------------------

    /**
     * Renders the Random.org API key section into #settings-randomorg-body.
     * Key is masked (password input). "Show" button reveals it for 10 seconds.
     * Includes a connection test and a save button.
     */
    renderRandomOrgSection() {
        const el = document.getElementById('settings-randomorg-body');
        if (!el) return;

        const s = this._settings || {};
        const currentKey = s.random_org_api_key || '';

        el.innerHTML = `
            <div class="form-group">
                <label for="randomorg-api-key">API Key</label>
                <div class="input-with-action">
                    <input type="password"
                           id="randomorg-api-key"
                           class="form-control"
                           value="${this._escHtml(currentKey)}"
                           placeholder="Enter your Random.org API key" />
                    <button class="btn btn--ghost btn--sm js-randomorg-show" id="btn-randomorg-show">Show</button>
                </div>
            </div>

            <div class="settings-actions settings-actions--row">
                <button class="btn btn--secondary js-randomorg-test">Test connection</button>
                <button class="btn btn--primary js-randomorg-save">Save</button>
            </div>

            <div class="connection-badge-wrap" id="randomorg-connection-result" style="display:none;"></div>
            <div class="settings-feedback" id="randomorg-feedback" role="alert" style="display:none;"></div>`;

        this._bindRandomOrgEvents();
    }

    // -------------------------
    // Render: platform config section
    // -------------------------

    /**
     * Renders the platform configuration section into #settings-platform-body.
     * Includes margin warning and filling fast thresholds, plus a read-only withdrawal note.
     */
    renderPlatformSection() {
        const el = document.getElementById('settings-platform-body');
        if (!el) return;

        const s = this._settings || {};
        const marginThreshold  = s.margin_warning_threshold != null ? s.margin_warning_threshold : 20;
        const fillingThreshold = s.filling_fast_threshold   != null ? s.filling_fast_threshold   : 80;

        el.innerHTML = `
            <div class="form-group">
                <label for="platform-margin-threshold">Margin warning threshold</label>
                <div class="input-with-suffix">
                    <input type="number"
                           id="platform-margin-threshold"
                           class="form-control"
                           min="1"
                           max="100"
                           value="${this._escHtml(String(marginThreshold))}" />
                    <span class="input-suffix">%</span>
                </div>
                <p class="form-hint">Swarms with a margin below this percentage will display a warning.</p>
            </div>

            <div class="form-group">
                <label for="platform-filling-threshold">Filling fast threshold</label>
                <div class="input-with-suffix">
                    <input type="number"
                           id="platform-filling-threshold"
                           class="form-control"
                           min="1"
                           max="100"
                           value="${this._escHtml(String(fillingThreshold))}" />
                    <span class="input-suffix">%</span>
                </div>
                <p class="form-hint">Swarms filled beyond this percentage will be marked "Filling Fast".</p>
            </div>

            <div class="form-group">
                <label>Minimum withdrawal amount</label>
                <div class="form-control form-control--readonly" aria-readonly="true">
                    Nt 10 <span class="form-hint-inline">(Phase 1 fixed)</span>
                </div>
            </div>

            <div class="settings-actions">
                <button class="btn btn--primary js-platform-save">Save platform settings</button>
            </div>
            <div class="settings-feedback" id="platform-feedback" role="alert" style="display:none;"></div>`;

        this._bindPlatformEvents();
    }

    // -------------------------
    // Private: data loaders
    // -------------------------

    /**
     * Parse the JWT stored in localStorage under 'admin_token'
     * to extract the current staff member's ID.
     * Sets this._currentStaffId (number or null).
     */
    _parseCurrentStaffId() {
        try {
            const token = App.Admin.AuthService.getToken();
            if (!token) return;

            const parts = token.split('.');
            if (parts.length !== 3) return;

            const payload = JSON.parse(atob(parts[1]));
            this._currentStaffId = payload.id || payload.sub || payload.staff_id || null;

            // Normalise to a number if the API returns numeric IDs
            if (this._currentStaffId !== null) {
                const asNum = Number(this._currentStaffId);
                if (!isNaN(asNum)) this._currentStaffId = asNum;
            }
        } catch (_) {
            this._currentStaffId = null;
        }
    }

    /**
     * Fetch platform settings from the API.
     * @returns {Promise<void>}
     */
    async _loadSettings() {
        const res = await this._api.get('/admin/settings');
        this._settings = (res && res.data) ? res.data : (res || {});
    }

    /**
     * Fetch the full staff list from the API.
     * @returns {Promise<void>}
     */
    async _loadStaff() {
        const res  = await this._api.get('/admin/staff');
        this._staff = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
    }

    // -------------------------
    // Private: event binding
    // -------------------------

    /**
     * Bind all event listeners for the staff section.
     */
    _bindStaffEvents() {
        const self = this;

        // Toggle add-staff form
        $(document).on('click', '.js-staff-add-toggle', function () {
            const $form = $('#add-staff-form');
            const $btn  = $('#btn-add-staff');
            const isHidden = $form.is(':hidden');
            $form.toggle(isHidden);
            $btn.text(isHidden ? '− Cancel' : '+ Add staff member');
            $('#add-staff-error').hide().text('');
        });

        // Cancel button inside the form
        $(document).on('click', '.js-staff-cancel', function () {
            $('#add-staff-form').hide();
            $('#btn-add-staff').text('+ Add staff member');
            $('#add-staff-error').hide().text('');
        });

        // Deactivate staff
        $(document).on('click', '.js-staff-deactivate', async function () {
            const id  = $(this).data('id');
            const $btn = $(this);
            $btn.prop('disabled', true).text('Deactivating…');
            try {
                await self._api.mutate('PATCH', `/admin/staff/${id}`, { is_active: 0 });
                await self._loadStaff();
                self.renderStaffSection();
            } catch (err) {
                $btn.prop('disabled', false).text('Deactivate');
                self._showToast('Failed to deactivate staff member: ' + (err.message || 'Unknown error'), 'error');
            }
        });

        // Reactivate staff
        $(document).on('click', '.js-staff-reactivate', async function () {
            const id  = $(this).data('id');
            const $btn = $(this);
            $btn.prop('disabled', true).text('Reactivating…');
            try {
                await self._api.mutate('PATCH', `/admin/staff/${id}`, { is_active: 1 });
                await self._loadStaff();
                self.renderStaffSection();
            } catch (err) {
                $btn.prop('disabled', false).text('Reactivate');
                self._showToast('Failed to reactivate staff member: ' + (err.message || 'Unknown error'), 'error');
            }
        });

        // Submit new staff member
        $(document).on('click', '.js-staff-submit', async function () {
            const $btn      = $(this);
            const name      = $('#staff-name').val().trim();
            const email     = $('#staff-email').val().trim();
            const password  = $('#staff-password').val();
            const role      = $('#staff-role').val();
            const $errEl    = $('#add-staff-error');

            $errEl.hide().text('');

            if (!name || !email || !password || !role) {
                $errEl.text('All fields are required.').show();
                return;
            }

            $btn.prop('disabled', true).text('Creating…');

            try {
                await self._api.mutate('POST', '/admin/staff', { name, email, password, role });
                await self._loadStaff();
                self.renderStaffSection();
                self._showToast('Staff member created.', 'success');
            } catch (err) {
                $btn.prop('disabled', false).text('Create staff member');
                $errEl.text(err.message || 'Failed to create staff member.').show();
            }
        });
    }

    /**
     * Bind all event listeners for the regions section.
     */
    _bindRegionsEvents() {
        const self = this;

        // US region toggle — save immediately on change
        $(document).on('change', '.js-us-region-toggle', async function () {
            const val = $(this).is(':checked') ? 1 : 0;
            try {
                await self._api.mutate('PATCH', '/admin/settings', { us_region_active: val });
                if (self._settings) self._settings.us_region_active = val;
            } catch (err) {
                // Revert the toggle on failure
                $(this).prop('checked', !$(this).is(':checked'));
                self._showFeedback('regions-feedback', 'Failed to update US region: ' + (err.message || 'Unknown error'), 'error');
            }
        });

        // Save default region
        $(document).on('click', '.js-regions-save', async function () {
            const $btn = $(this);
            const val  = $('#select-default-region').val();
            $btn.prop('disabled', true).text('Saving…');

            try {
                await self._api.mutate('PATCH', '/admin/settings', { com_default_region: val });
                if (self._settings) self._settings.com_default_region = val;
                self._showFeedback('regions-feedback', 'Region settings saved.', 'success');
            } catch (err) {
                self._showFeedback('regions-feedback', 'Failed to save: ' + (err.message || 'Unknown error'), 'error');
            } finally {
                $btn.prop('disabled', false).text('Save region settings');
            }
        });
    }

    /**
     * Bind all event listeners for the Random.org section.
     */
    _bindRandomOrgEvents() {
        const self = this;
        let _showTimer = null;

        // Toggle show/hide API key
        $(document).on('click', '.js-randomorg-show', function () {
            const $input = $('#randomorg-api-key');
            const $btn   = $(this);

            if ($input.attr('type') === 'password') {
                $input.attr('type', 'text');
                $btn.text('Hide');
                clearTimeout(_showTimer);
                _showTimer = setTimeout(() => {
                    $input.attr('type', 'password');
                    $btn.text('Show');
                }, 10000);
            } else {
                clearTimeout(_showTimer);
                $input.attr('type', 'password');
                $btn.text('Show');
            }
        });

        // Test connection
        $(document).on('click', '.js-randomorg-test', async function () {
            const $btn    = $(this);
            const $result = $('#randomorg-connection-result');
            $btn.prop('disabled', true).text('Testing…');
            $result.hide().html('');

            try {
                const res = await self._api.get('/admin/settings/test-random-org');
                $result
                    .html(`<span class="connection-badge connection-badge--ok">Connected</span>`)
                    .show();
            } catch (err) {
                const msg = (err && err.message) ? err.message : 'Connection failed';
                $result
                    .html(`<span class="connection-badge connection-badge--error">Error: ${self._escHtml(msg)}</span>`)
                    .show();
            } finally {
                $btn.prop('disabled', false).text('Test connection');
            }
        });

        // Save API key
        $(document).on('click', '.js-randomorg-save', async function () {
            const $btn  = $(this);
            const key   = $('#randomorg-api-key').val();
            $btn.prop('disabled', true).text('Saving…');

            try {
                await self._api.mutate('PATCH', '/admin/settings', { random_org_api_key: key });
                if (self._settings) self._settings.random_org_api_key = key;
                self._showToast('Random.org API key saved.', 'success');
                self._showFeedback('randomorg-feedback', 'Saved.', 'success');
            } catch (err) {
                self._showFeedback('randomorg-feedback', 'Failed to save: ' + (err.message || 'Unknown error'), 'error');
            } finally {
                $btn.prop('disabled', false).text('Save');
            }
        });
    }

    /**
     * Bind all event listeners for the platform config section.
     */
    _bindPlatformEvents() {
        const self = this;

        $(document).on('click', '.js-platform-save', async function () {
            const $btn             = $(this);
            const marginRaw        = parseInt($('#platform-margin-threshold').val(), 10);
            const fillingRaw       = parseInt($('#platform-filling-threshold').val(), 10);
            const $feedback        = $('#platform-feedback');

            $feedback.hide().text('');

            if (isNaN(marginRaw) || marginRaw < 1 || marginRaw > 100) {
                $feedback.text('Margin warning threshold must be between 1 and 100.').show();
                return;
            }
            if (isNaN(fillingRaw) || fillingRaw < 1 || fillingRaw > 100) {
                $feedback.text('Filling fast threshold must be between 1 and 100.').show();
                return;
            }

            $btn.prop('disabled', true).text('Saving…');

            try {
                await self._api.mutate('PATCH', '/admin/settings', {
                    margin_warning_threshold: marginRaw,
                    filling_fast_threshold:   fillingRaw
                });
                if (self._settings) {
                    self._settings.margin_warning_threshold = marginRaw;
                    self._settings.filling_fast_threshold   = fillingRaw;
                }
                self._showToast('Platform settings saved.', 'success');
                self._showFeedback('platform-feedback', 'Saved.', 'success');
            } catch (err) {
                self._showFeedback('platform-feedback', 'Failed to save: ' + (err.message || 'Unknown error'), 'error');
            } finally {
                $btn.prop('disabled', false).text('Save platform settings');
            }
        });
    }

    // -------------------------
    // Private: helpers
    // -------------------------

    /**
     * Format a role key into a human-readable label.
     * @param {string} role
     * @returns {string}
     */
    _formatRole(role) {
        const map = {
            'staff':       'Staff',
            'admin':       'Admin',
            'super_admin': 'Super Admin'
        };
        return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    /**
     * Return a CSS class for a role badge.
     * @param {string} role
     * @returns {string}
     */
    _roleClass(role) {
        const map = {
            'staff':       'role-badge--staff',
            'admin':       'role-badge--admin',
            'super_admin': 'role-badge--super-admin'
        };
        return map[role] || 'role-badge--staff';
    }

    /**
     * Show an inline feedback message inside a named element.
     * Auto-hides after 5 seconds.
     * @param {string} elementId
     * @param {string} message
     * @param {'success'|'error'} type
     */
    _showFeedback(elementId, message, type) {
        const $el = $('#' + elementId);
        if (!$el.length) return;

        $el
            .removeClass('feedback--success feedback--error')
            .addClass(type === 'success' ? 'feedback--success' : 'feedback--error')
            .text(message)
            .show();

        setTimeout(() => $el.fadeOut(), 5000);
    }

    /**
     * Show a brief toast notification at the top of the page.
     * Creates a toast container if one does not already exist.
     * @param {string} message
     * @param {'success'|'error'} type
     */
    _showToast(message, type) {
        let $container = $('#admin-toast-container');
        if (!$container.length) {
            $container = $('<div id="admin-toast-container" aria-live="polite"></div>');
            $('body').append($container);
        }

        const cls   = type === 'success' ? 'toast--success' : 'toast--error';
        const $toast = $(`<div class="admin-toast ${cls}">${this._escHtml(message)}</div>`);

        $container.append($toast);
        setTimeout(() => $toast.addClass('admin-toast--visible'), 10);
        setTimeout(() => {
            $toast.removeClass('admin-toast--visible');
            setTimeout(() => $toast.remove(), 300);
        }, 3500);
    }

    /**
     * Show a full-page error inside #admin-root when initial load fails.
     * @param {string} message
     */
    _showRootError(message) {
        const root = document.getElementById('admin-root');
        if (!root) return;
        root.innerHTML = `<div class="dashboard-error" role="alert">${this._escHtml(message)}</div>`;
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
