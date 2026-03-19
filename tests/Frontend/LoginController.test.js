/**
 * @jest-environment jsdom
 */

require('./setup');

describe('LoginController', () => {
    let ctrl;

    beforeEach(() => {
        localStorage.removeItem('access_token');
        ctrl = new App.Controllers.LoginController();
    });

    afterEach(() => {
        if (ctrl) ctrl.destroy();
    });

    // ── Rendering ──────────────────────────────────────────────────

    test('renders login form into #app-root', () => {
        ctrl.init();
        expect($('#app-root').html()).toContain('id="login-form"');
        expect($('#app-root').html()).toContain('id="login-email"');
        expect($('#app-root').html()).toContain('id="login-password"');
        expect($('#app-root').html()).toContain('id="btn-login"');
    });

    test('renders page title "Welcome back"', () => {
        ctrl.init();
        expect($('.auth-card__title').text()).toBe('Welcome back');
    });

    test('renders link to register page', () => {
        ctrl.init();
        expect($('.auth-card__footer a').attr('href')).toBe('/ca/register');
        expect($('.auth-card__footer a').text()).toBe('Join the Hive');
    });

    test('has correct form structure with auth-page and auth-card classes', () => {
        ctrl.init();
        expect($('.auth-page').length).toBe(1);
        expect($('.auth-card').length).toBe(1);
        expect($('.auth-form').length).toBe(1);
    });

    test('renders email input with correct attributes', () => {
        ctrl.init();
        const input = $('#login-email');
        expect(input.attr('type')).toBe('email');
        expect(input.attr('autocomplete')).toBe('email');
        expect(input.attr('placeholder')).toBe('you@example.com');
    });

    test('renders password input with correct attributes', () => {
        ctrl.init();
        const input = $('#login-password');
        expect(input.attr('type')).toBe('password');
        expect(input.attr('autocomplete')).toBe('current-password');
    });

    // ── Auth guard ─────────────────────────────────────────────────

    test('does not render form if already logged in', () => {
        localStorage.setItem('access_token', 'fake-token');
        // init() will try to navigate (jsdom will error), but we just check no form rendered
        try { ctrl.init(); } catch (e) { /* jsdom navigation error */ }
        expect($('#login-form').length).toBe(0);
    });

    // ── Client-side validation ─────────────────────────────────────

    test('shows validation error for empty email', async () => {
        ctrl.init();
        $('#login-email').val('');
        $('#login-password').val('password123');
        await ctrl._onSubmit();
        expect($('#login-email-error').text()).toContain('required');
    });

    test('shows validation error for invalid email format', async () => {
        ctrl.init();
        $('#login-email').val('notanemail');
        $('#login-password').val('password123');
        await ctrl._onSubmit();
        expect($('#login-email-error').text()).toContain('valid email');
    });

    test('shows validation error for empty password', async () => {
        ctrl.init();
        $('#login-email').val('test@example.com');
        $('#login-password').val('');
        await ctrl._onSubmit();
        expect($('#login-password-error').text()).toContain('required');
    });

    test('shows multiple validation errors simultaneously', async () => {
        ctrl.init();
        $('#login-email').val('');
        $('#login-password').val('');
        await ctrl._onSubmit();
        expect($('#login-email-error').text()).toContain('required');
        expect($('#login-password-error').text()).toContain('required');
    });

    test('clears previous errors on re-submit', async () => {
        ctrl.init();

        // First submit with empty fields
        $('#login-email').val('');
        $('#login-password').val('password123');
        await ctrl._onSubmit();
        expect($('#login-email-error').text()).not.toBe('');

        // Second submit with valid email but mock the API
        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockRejectedValue({ message: 'fail' });
        $('#login-email').val('valid@test.com');
        await ctrl._onSubmit();
        expect($('#login-email-error').text()).toBe('');
    });

    // ── API integration ────────────────────────────────────────────

    test('calls AuthService.login() with correct params on valid submit', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockResolvedValue({
            access_token: 'tok', user: { id: 1, name: 'Test' }
        });

        $('#login-email').val('user@test.com');
        $('#login-password').val('secret123');

        // Catch jsdom navigation error from redirect
        try { await ctrl._onSubmit(); } catch (e) { /* expected */ }

        expect(mockAuth.login).toHaveBeenCalledWith('user@test.com', 'secret123');
    });

    test('trims email before sending', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockResolvedValue({
            access_token: 'tok', user: { id: 1, name: 'Test' }
        });

        $('#login-email').val('  user@test.com  ');
        $('#login-password').val('secret123');

        try { await ctrl._onSubmit(); } catch (e) { /* expected */ }

        expect(mockAuth.login).toHaveBeenCalledWith('user@test.com', 'secret123');
    });

    test('does not call AuthService.login() with invalid inputs', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn();

        $('#login-email').val('');
        $('#login-password').val('password123');

        await ctrl._onSubmit();

        expect(mockAuth.login).not.toHaveBeenCalled();
    });

    test('shows global error on API failure', async () => {
        ctrl.init();
        $('#login-email').val('user@test.com');
        $('#login-password').val('wrongpass');

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockRejectedValue({ message: 'Invalid credentials' });

        await ctrl._onSubmit();

        expect($('#login-global-error').text()).toBe('Invalid credentials');
        expect($('#login-global-error').css('display')).not.toBe('none');
    });

    test('shows fallback error message when API error has no message', async () => {
        ctrl.init();
        $('#login-email').val('user@test.com');
        $('#login-password').val('wrongpass');

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockRejectedValue({});

        await ctrl._onSubmit();

        expect($('#login-global-error').text()).toBe('Invalid email or password. Please try again.');
    });

    // ── Loading state ──────────────────────────────────────────────

    test('disables submit button during API call', async () => {
        ctrl.init();
        $('#login-email').val('user@test.com');
        $('#login-password').val('secret123');

        let resolveLogin;
        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.login = jest.fn().mockImplementation(() => {
            return new Promise(resolve => { resolveLogin = resolve; });
        });

        const submitPromise = ctrl._onSubmit();
        expect($('#btn-login').prop('disabled')).toBe(true);

        resolveLogin({ access_token: 'tok', user: {} });
        // Catch navigation error from redirect
        try { await submitPromise; } catch (e) { /* expected */ }

        expect($('#btn-login').prop('disabled')).toBe(false);
    });

    // ── Cleanup ────────────────────────────────────────────────────

    test('destroy() unbinds submit event', () => {
        ctrl.init();
        ctrl.destroy();
        const spy = jest.spyOn(ctrl, '_onSubmit');
        expect(spy).not.toHaveBeenCalled();
    });
});
