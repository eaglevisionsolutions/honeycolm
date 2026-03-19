/**
 * App.Admin.AuthService
 * Admin JWT storage, login, logout, and auth guard.
 * Uses a separate localStorage key (hc_admin_token) from
 * the member token (hc_member_token) to prevent any collision.
 */

'use strict';

window.App       = window.App       || {};
window.App.Admin = window.App.Admin || {};

App.Admin.AuthService = class AuthService {

    // -------------------------
    // Token key constant
    // -------------------------

    static get TOKEN_KEY() {
        return 'hc_admin_token';
    }

    // -------------------------
    // Token management
    // -------------------------

    /**
     * Returns the stored admin JWT, or null if absent.
     * @returns {string|null}
     */
    static getToken() {
        return localStorage.getItem(App.Admin.AuthService.TOKEN_KEY);
    }

    /**
     * Persists the admin JWT to localStorage.
     * @param {string} token
     */
    static setToken(token) {
        localStorage.setItem(App.Admin.AuthService.TOKEN_KEY, token);
    }

    /**
     * Removes the admin JWT from localStorage (logout).
     */
    static logout() {
        localStorage.removeItem(App.Admin.AuthService.TOKEN_KEY);
    }

    /**
     * Returns true if an admin JWT is present in localStorage.
     * @returns {boolean}
     */
    static isAuthenticated() {
        return !!App.Admin.AuthService.getToken();
    }

    // -------------------------
    // Auth guard
    // -------------------------

    /**
     * Redirect to /admin/login.html if no admin JWT is present.
     * Call this as the very first script on every protected admin page.
     */
    static guard() {
        if (!App.Admin.AuthService.isAuthenticated()) {
            window.location.href = '/admin/login.html';
        }
    }

    // -------------------------
    // Login
    // -------------------------

    /**
     * POST /api/v1/admin/auth/login
     * On success stores the returned JWT via setToken().
     * Throws an Error on failure (401, 422, network error).
     *
     * @param {string} email
     * @param {string} password
     * @returns {Promise<void>}
     */
    static async login(email, password) {
        const response = await fetch('/api/v1/admin/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        let body;
        try {
            body = await response.json();
        } catch (_) {
            throw new Error('Server returned an unexpected response. Please try again.');
        }

        if (!response.ok || !body.success) {
            const message = (body && body.message)
                ? body.message
                : 'Invalid email or password.';
            throw new Error(message);
        }

        // Accept either response.token or response.data.access_token
        const token = (body.data && body.data.access_token)
            ? body.data.access_token
            : (body.token || null);

        if (!token) {
            throw new Error('Login succeeded but no token was returned. Contact support.');
        }

        App.Admin.AuthService.setToken(token);
    }
};
