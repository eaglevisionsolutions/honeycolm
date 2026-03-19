/**
 * App.Controllers.RegisterController
 * Member registration form. Calls AuthService.register(), redirects to /ca/account on success.
 * Auto-detects home_region from URL path prefix (same logic as RegionSwitcher).
 */

'use strict';

App.Controllers.RegisterController = class RegisterController extends App.Controllers.BaseController {

    constructor() {
        super();
    }

    init() {
        if (this._auth.isLoggedIn()) {
            window.location.href = '/ca/account';
            return;
        }

        this._renderForm();
        this._bindEvents();
    }

    destroy() {
        $(document).off('submit.registerForm');
    }

    _detectRegion() {
        const match = window.location.pathname.match(/^\/([a-z]{2})\//);
        if (match) return match[1];
        const cookieMatch = document.cookie.match(/(?:^|;)\s*region=([a-z]{2})/);
        if (cookieMatch) return cookieMatch[1];
        return 'ca';
    }

    _renderForm() {
        const region = this._detectRegion();

        const html = `
        <div class="auth-page">
            <div class="auth-card">
                <h1 class="auth-card__title">Join the Hive</h1>
                <p class="auth-card__subtitle">Create your Honeycolm account and start swarming</p>
                <form id="register-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="reg-name">Name</label>
                        <input type="text" id="reg-name" name="name" class="form-input" required autocomplete="name" placeholder="Your name" minlength="2" maxlength="100">
                        <span class="field-error" id="reg-name-error"></span>
                    </div>
                    <div class="form-group">
                        <label for="reg-email">Email</label>
                        <input type="email" id="reg-email" name="email" class="form-input" required autocomplete="email" placeholder="you@example.com">
                        <span class="field-error" id="reg-email-error"></span>
                    </div>
                    <div class="form-group">
                        <label for="reg-region">Home region</label>
                        <select id="reg-region" name="home_region" class="form-input" required>
                            <option value="ca"${region === 'ca' ? ' selected' : ''}>Canada</option>
                            <option value="us"${region === 'us' ? ' selected' : ''}>United States</option>
                        </select>
                        <span class="field-error" id="reg-region-error"></span>
                    </div>
                    <div class="form-group">
                        <label for="reg-password">Password</label>
                        <input type="password" id="reg-password" name="password" class="form-input" required autocomplete="new-password" placeholder="At least 8 characters" minlength="8">
                        <span class="field-error" id="reg-password-error"></span>
                    </div>
                    <div class="form-group">
                        <label for="reg-confirm">Confirm password</label>
                        <input type="password" id="reg-confirm" name="confirm_password" class="form-input" required autocomplete="new-password" placeholder="Re-enter your password">
                        <span class="field-error" id="reg-confirm-error"></span>
                    </div>
                    <div class="auth-form__error" id="reg-global-error" style="display:none;"></div>
                    <button type="submit" class="btn-primary btn-full" id="btn-register">Join the Hive</button>
                </form>
                <p class="auth-card__footer">Already have an account? <a href="/ca/login">Log in</a></p>
            </div>
        </div>`;

        $('#app-root').html(html);
    }

    _bindEvents() {
        const self = this;
        $(document).off('submit.registerForm').on('submit.registerForm', '#register-form', function (e) {
            e.preventDefault();
            self._onSubmit();
        });
    }

    async _onSubmit() {
        this._clearErrors();
        const name       = $('#reg-name').val().trim();
        const email      = $('#reg-email').val().trim();
        const password   = $('#reg-password').val();
        const confirm    = $('#reg-confirm').val();
        const homeRegion = $('#reg-region').val();

        this._validator.reset();
        this._validator
            .required('name', name, 'Name')
            .minLength('name', name, 2, 'Name')
            .required('email', email, 'Email')
            .email('email', email, 'Email')
            .required('home_region', homeRegion, 'Home region')
            .required('password', password, 'Password')
            .minLength('password', password, 8, 'Password')
            .required('confirm_password', confirm, 'Confirm password')
            .matches('confirm_password', confirm, password, 'Passwords');

        if (this._validator.fails()) {
            const errors = this._validator.errors();
            if (errors.name)             $('#reg-name-error').text(errors.name);
            if (errors.email)            $('#reg-email-error').text(errors.email);
            if (errors.home_region)      $('#reg-region-error').text(errors.home_region);
            if (errors.password)         $('#reg-password-error').text(errors.password);
            if (errors.confirm_password) $('#reg-confirm-error').text(errors.confirm_password);
            return;
        }

        this.setLoading('#btn-register', true);

        try {
            await this._auth.register(name, email, password, homeRegion);
            window.location.href = '/ca/account';
        } catch (err) {
            if (err && err.errors) {
                if (err.errors.name)        $('#reg-name-error').text(err.errors.name);
                if (err.errors.email)       $('#reg-email-error').text(err.errors.email);
                if (err.errors.home_region) $('#reg-region-error').text(err.errors.home_region);
                if (err.errors.password)    $('#reg-password-error').text(err.errors.password);
            } else {
                const msg = (err && err.message) ? err.message : 'Registration failed. Please try again.';
                $('#reg-global-error').text(msg).show();
            }
        } finally {
            this.setLoading('#btn-register', false);
        }
    }

    _clearErrors() {
        $('.field-error').text('');
        $('#reg-global-error').hide().text('');
    }
};
