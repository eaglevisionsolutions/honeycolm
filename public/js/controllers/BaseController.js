/**
 * App.Controllers.BaseController
 * Base class for all page/component controllers.
 */

'use strict';

App.Controllers.BaseController = class BaseController {

    constructor() {
        this._api      = App.Services.ApiService.getInstance();
        this._auth     = App.Services.AuthService.getInstance();
        this._sync     = App.Services.SyncService.getInstance();
        this._validator = new App.Utils.Validator();
    }

    // -------------------------
    // Lifecycle hooks (override in subclasses)
    // -------------------------

    /**
     * Called once when the controller is instantiated.
     * Bind events, fetch initial data, render UI here.
     */
    init() {}

    /**
     * Called when navigating away from this controller's page.
     * Unbind events, clear timers, etc.
     */
    destroy() {}

    // -------------------------
    // Notification helpers
    // -------------------------

    showSuccess(message, container = '#notifications') {
        this._showAlert('success', message, container);
    }

    showError(message, container = '#notifications') {
        this._showAlert('danger', message, container);
    }

    showInfo(message, container = '#notifications') {
        this._showAlert('info', message, container);
    }

    showOfflineWarning() {
        this.showInfo('You are offline. Changes will sync when reconnected.');
    }

    // -------------------------
    // Loading state helpers
    // -------------------------

    setLoading(buttonSelector, loading = true) {
        const btn = $(buttonSelector);
        if (loading) {
            btn.data('original-text', btn.text())
               .prop('disabled', true)
               .text('Loading...');
        } else {
            btn.prop('disabled', false)
               .text(btn.data('original-text') || 'Submit');
        }
    }

    // -------------------------
    // Private
    // -------------------------

    _showAlert(type, message, container) {
        const id    = 'alert-' + Date.now();
        const html  = `
            <div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;

        $(container).append(html);

        // Auto-remove after 5s
        setTimeout(() => $(`#${id}`).remove(), 5000);
    }
};
