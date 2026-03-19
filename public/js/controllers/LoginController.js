/**
 * App.Controllers.LoginController
 * Member login form. Calls AuthService.login(), redirects to /ca/account on success.
 */

'use strict';

App.Controllers.LoginController = class LoginController extends App.Controllers.BaseController {

    constructor() {
        super();
    }

    init() {
        // If already logged in, redirect to account
        if (this._auth.isLoggedIn()) {
            window.location.href = '/ca/account';
            return;
        }

        this._renderForm();
        this._bindEvents();
    }

    destroy() {
        $(document).off('submit.loginForm');
    }

    _renderForm() {
        const html = `
        <div class="auth-page">
            <div class="auth-card">
                <h1 class="auth-card__title">Welcome back</h1>
                <p class="auth-card__subtitle">Log in to your Honeycolm account</p>
                <form id="login-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="login-email">Email</label>
                        <input type="email" id="login-email" name="email" class="form-input" required autocomplete="email" placeholder="you@example.com">
                        <span class="field-error" id="login-email-error"></span>
                    </div>
                    <div class="form-group">
                        <label for="login-password">Password</label>
                        <input type="password" id="login-password" name="password" class="form-input" required autocomplete="current-password" placeholder="Your password">
                        <span class="field-error" id="login-password-error"></span>
                    </div>
                    <div class="auth-form__error" id="login-global-error" style="display:none;"></div>
                    <button type="submit" class="btn-primary btn-full" id="btn-login">Log in</button>
                </form>
                <p class="auth-card__footer">Don't have an account? <a href="/ca/register">Join the Hive</a></p>
            </div>
        </div>`;

        $('#app-root').html(html);
    }

    _bindEvents() {
        const self = this;
        $(document).off('submit.loginForm').on('submit.loginForm', '#login-form', function (e) {
            e.preventDefault();
            self._onSubmit();
        });
    }

    async _onSubmit() {
        this._clearErrors();
        const email    = $('#login-email').val().trim();
        const password = $('#login-password').val();

        this._validator.reset();
        this._validator
            .required('email', email, 'Email')
            .email('email', email, 'Email')
            .required('password', password, 'Password');

        if (this._validator.fails()) {
            const errors = this._validator.errors();
            if (errors.email)    $('#login-email-error').text(errors.email);
            if (errors.password) $('#login-password-error').text(errors.password);
            return;
        }

        this.setLoading('#btn-login', true);

        try {
            await this._auth.login(email, password);
            window.location.href = '/ca/account';
        } catch (err) {
            const msg = (err && err.message) ? err.message : 'Invalid email or password. Please try again.';
            $('#login-global-error').text(msg).show();
        } finally {
            this.setLoading('#btn-login', false);
        }
    }

    _clearErrors() {
        $('.field-error').text('');
        $('#login-global-error').hide().text('');
    }
};
