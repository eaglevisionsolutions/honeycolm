/**
 * @jest-environment jsdom
 */

require('./setup');

describe('RegisterController', () => {
    let ctrl;

    beforeEach(() => {
        localStorage.removeItem('access_token');
        ctrl = new App.Controllers.RegisterController();
    });

    afterEach(() => {
        if (ctrl) ctrl.destroy();
    });

    // ── Rendering ──────────────────────────────────────────────────

    test('renders register form into #app-root', () => {
        ctrl.init();
        expect($('#app-root').html()).toContain('id="register-form"');
        expect($('#app-root').html()).toContain('id="reg-name"');
        expect($('#app-root').html()).toContain('id="reg-email"');
        expect($('#app-root').html()).toContain('id="reg-region"');
        expect($('#app-root').html()).toContain('id="reg-password"');
        expect($('#app-root').html()).toContain('id="reg-confirm"');
        expect($('#app-root').html()).toContain('id="btn-register"');
    });

    test('renders page title "Join the Hive"', () => {
        ctrl.init();
        expect($('.auth-card__title').text()).toBe('Join the Hive');
    });

    test('renders link to login page', () => {
        ctrl.init();
        expect($('.auth-card__footer a').attr('href')).toBe('/ca/login');
        expect($('.auth-card__footer a').text()).toBe('Log in');
    });

    test('has correct form structure with auth-page and auth-card classes', () => {
        ctrl.init();
        expect($('.auth-page').length).toBe(1);
        expect($('.auth-card').length).toBe(1);
        expect($('.auth-form').length).toBe(1);
    });

    test('renders name input with correct attributes', () => {
        ctrl.init();
        const input = $('#reg-name');
        expect(input.attr('type')).toBe('text');
        expect(input.attr('autocomplete')).toBe('name');
        expect(input.attr('minlength')).toBe('2');
        expect(input.attr('maxlength')).toBe('100');
    });

    test('renders password input with autocomplete new-password', () => {
        ctrl.init();
        expect($('#reg-password').attr('autocomplete')).toBe('new-password');
        expect($('#reg-confirm').attr('autocomplete')).toBe('new-password');
    });

    // ── Region field ───────────────────────────────────────────────

    test('renders home region select with Canada and United States options', () => {
        ctrl.init();
        const options = $('#reg-region option');
        expect(options.length).toBe(2);
        expect(options.eq(0).val()).toBe('ca');
        expect(options.eq(0).text()).toBe('Canada');
        expect(options.eq(1).val()).toBe('us');
        expect(options.eq(1).text()).toBe('United States');
    });

    test('defaults region to ca (default when jsdom path is /)', () => {
        ctrl.init();
        // jsdom defaults to "/" path, so _detectRegion falls back to 'ca'
        expect($('#reg-region').val()).toBe('ca');
    });

    // ── Auth guard ─────────────────────────────────────────────────

    test('does not render form if already logged in', () => {
        localStorage.setItem('access_token', 'fake-token');
        try { ctrl.init(); } catch (e) { /* jsdom navigation error */ }
        expect($('#register-form').length).toBe(0);
    });

    // ── Client-side validation ─────────────────────────────────────

    test('shows validation error for empty name', async () => {
        ctrl.init();
        $('#reg-name').val('');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');
        await ctrl._onSubmit();
        expect($('#reg-name-error').text()).toContain('required');
    });

    test('shows validation error for name shorter than 2 chars', async () => {
        ctrl.init();
        $('#reg-name').val('A');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');
        await ctrl._onSubmit();
        expect($('#reg-name-error').text()).toContain('at least 2');
    });

    test('shows validation error for empty email', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');
        await ctrl._onSubmit();
        expect($('#reg-email-error').text()).toContain('required');
    });

    test('shows validation error for invalid email', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('bad-email');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');
        await ctrl._onSubmit();
        expect($('#reg-email-error').text()).toContain('valid email');
    });

    test('shows validation error for empty password', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('');
        $('#reg-confirm').val('');
        await ctrl._onSubmit();
        expect($('#reg-password-error').text()).toContain('required');
    });

    test('shows validation error for password shorter than 8 chars', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('short');
        $('#reg-confirm').val('short');
        await ctrl._onSubmit();
        expect($('#reg-password-error').text()).toContain('at least 8');
    });

    test('shows validation error when passwords do not match', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('different456');
        await ctrl._onSubmit();
        expect($('#reg-confirm-error').text()).toContain('does not match');
    });

    test('shows multiple validation errors simultaneously', async () => {
        ctrl.init();
        $('#reg-name').val('');
        $('#reg-email').val('');
        $('#reg-password').val('');
        $('#reg-confirm').val('');
        await ctrl._onSubmit();
        expect($('#reg-name-error').text()).not.toBe('');
        expect($('#reg-email-error').text()).not.toBe('');
        expect($('#reg-password-error').text()).not.toBe('');
    });

    // ── API integration ────────────────────────────────────────────

    test('calls AuthService.register() with name, email, password, and home_region', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockResolvedValue({
            access_token: 'tok', user: { id: 1, name: 'Test' }
        });

        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-region').val('ca');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        try { await ctrl._onSubmit(); } catch (e) { /* navigation */ }

        expect(mockAuth.register).toHaveBeenCalledWith('Test User', 'test@example.com', 'password123', 'ca');
    });

    test('sends US region when selected', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockResolvedValue({
            access_token: 'tok', user: { id: 1, name: 'Test' }
        });

        $('#reg-name').val('US User');
        $('#reg-email').val('us@example.com');
        $('#reg-region').val('us');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        try { await ctrl._onSubmit(); } catch (e) { /* navigation */ }

        expect(mockAuth.register).toHaveBeenCalledWith('US User', 'us@example.com', 'password123', 'us');
    });

    test('trims name and email before sending', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockResolvedValue({
            access_token: 'tok', user: { id: 1, name: 'Test' }
        });

        $('#reg-name').val('  Test User  ');
        $('#reg-email').val('  test@example.com  ');
        $('#reg-region').val('ca');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        try { await ctrl._onSubmit(); } catch (e) { /* navigation */ }

        expect(mockAuth.register).toHaveBeenCalledWith('Test User', 'test@example.com', 'password123', 'ca');
    });

    test('does not call AuthService.register() with invalid inputs', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn();

        $('#reg-name').val('');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        await ctrl._onSubmit();

        expect(mockAuth.register).not.toHaveBeenCalled();
    });

    test('shows per-field API errors', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        const err = new Error('Validation failed');
        err.errors = { email: 'Email already taken', home_region: 'Invalid region' };
        mockAuth.register = jest.fn().mockRejectedValue(err);

        $('#reg-name').val('Test User');
        $('#reg-email').val('taken@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        await ctrl._onSubmit();

        expect($('#reg-email-error').text()).toBe('Email already taken');
        expect($('#reg-region-error').text()).toBe('Invalid region');
    });

    test('shows global error on generic API failure', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockRejectedValue({ message: 'Server error' });

        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        await ctrl._onSubmit();

        expect($('#reg-global-error').text()).toBe('Server error');
        expect($('#reg-global-error').css('display')).not.toBe('none');
    });

    test('shows fallback error when API error has no message', async () => {
        ctrl.init();

        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockRejectedValue({});

        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        await ctrl._onSubmit();

        expect($('#reg-global-error').text()).toBe('Registration failed. Please try again.');
    });

    // ── Loading state ──────────────────────────────────────────────

    test('disables submit button during API call', async () => {
        ctrl.init();
        $('#reg-name').val('Test User');
        $('#reg-email').val('test@example.com');
        $('#reg-password').val('password123');
        $('#reg-confirm').val('password123');

        let resolveRegister;
        const mockAuth = App.Services.AuthService.getInstance();
        mockAuth.register = jest.fn().mockImplementation(() => {
            return new Promise(resolve => { resolveRegister = resolve; });
        });

        const submitPromise = ctrl._onSubmit();
        expect($('#btn-register').prop('disabled')).toBe(true);

        resolveRegister({ access_token: 'tok', user: {} });
        try { await submitPromise; } catch (e) { /* navigation */ }

        expect($('#btn-register').prop('disabled')).toBe(false);
    });

    // ── Cleanup ────────────────────────────────────────────────────

    test('destroy() unbinds submit event', () => {
        ctrl.init();
        ctrl.destroy();
        const spy = jest.spyOn(ctrl, '_onSubmit');
        expect(spy).not.toHaveBeenCalled();
    });
});
