/**
 * App.Services.ApiService
 * Single choke point for all API communication.
 * All AJAX/fetch calls must go through this class.
 */

'use strict';

App.Services.ApiService = class ApiService {

    constructor() {
        this._token = localStorage.getItem('access_token') || null;
    }

    // -------------------------
    // Token management
    // -------------------------

    setToken(token) {
        this._token = token;
        localStorage.setItem('access_token', token);
    }

    clearToken() {
        this._token = null;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }

    // -------------------------
    // Core request method
    // -------------------------

    /**
     * @param {string} method  HTTP verb
     * @param {string} endpoint  Path relative to /api/v1
     * @param {object} [data]  Request body (for POST/PUT/PATCH)
     * @returns {Promise<object>}
     */
    async request(method, endpoint, data = null) {
        const url     = App.Config.apiBase + endpoint;
        const headers = { 'Content-Type': 'application/json' };

        if (this._token) {
            headers['Authorization'] = 'Bearer ' + this._token;
        }

        const options = { method, headers };

        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const json     = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error    = new Error(json.message || 'Request failed');
            error.status   = response.status;
            error.errors   = json.errors || {};
            throw error;
        }

        return json;
    }

    // -------------------------
    // Convenience methods
    // -------------------------

    get(endpoint)                { return this.request('GET', endpoint); }
    post(endpoint, data)         { return this.request('POST', endpoint, data); }
    put(endpoint, data)          { return this.request('PUT', endpoint, data); }
    patch(endpoint, data)        { return this.request('PATCH', endpoint, data); }
    delete(endpoint)             { return this.request('DELETE', endpoint); }

    // -------------------------
    // Mutation with offline fallback
    // Automatically queues if offline
    // -------------------------

    async mutate(method, endpoint, data = null) {
        if (!navigator.onLine) {
            App.Services.SyncService.getInstance().enqueue({ method, endpoint, data });
            return { success: true, queued: true, message: 'Saved offline. Will sync when reconnected.' };
        }

        return this.request(method, endpoint, data);
    }
};

// Singleton
App.Services.ApiService._instance = null;
App.Services.ApiService.getInstance = function () {
    if (!App.Services.ApiService._instance) {
        App.Services.ApiService._instance = new App.Services.ApiService();
    }
    return App.Services.ApiService._instance;
};
