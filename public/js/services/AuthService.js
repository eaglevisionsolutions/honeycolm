/**
 * App.Services.AuthService
 * Client-side authentication: login, register, logout, token refresh.
 */

'use strict';

App.Services.AuthService = class AuthService {

    constructor() {
        this._api = App.Services.ApiService.getInstance();
    }

    // -------------------------
    // Public methods
    // -------------------------

    async login(email, password) {
        const result = await this._api.post('/auth/login', { email, password });
        this._storeTokens(result.data);
        return result.data;
    }

    async register(name, email, password, homeRegion) {
        const result = await this._api.post('/auth/register', {
            name, email, password, home_region: homeRegion
        });
        this._storeTokens(result.data);
        return result.data;
    }

    async refresh() {
        const refreshToken = localStorage.getItem('refresh_token');

        if (!refreshToken) {
            throw new Error('No refresh token available.');
        }

        const result = await this._api.post('/auth/refresh', { refresh_token: refreshToken });
        this._api.setToken(result.data.access_token);

        return result.data;
    }

    logout() {
        this._api.clearToken();
        $(document).trigger('app:auth:logout');
    }

    isLoggedIn() {
        return !!localStorage.getItem('access_token');
    }

    currentUser() {
        const raw = localStorage.getItem('current_user');
        return raw ? JSON.parse(raw) : null;
    }

    // -------------------------
    // Private
    // -------------------------

    _storeTokens(data) {
        this._api.setToken(data.access_token);

        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }

        if (data.user) {
            localStorage.setItem('current_user', JSON.stringify(data.user));
        }

        $(document).trigger('app:auth:login', [data.user]);
    }
};

// Singleton
App.Services.AuthService._instance = null;
App.Services.AuthService.getInstance = function () {
    if (!App.Services.AuthService._instance) {
        App.Services.AuthService._instance = new App.Services.AuthService();
    }
    return App.Services.AuthService._instance;
};
