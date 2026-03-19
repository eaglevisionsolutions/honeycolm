/**
 * @jest-environment jsdom
 */

require('./setup');

describe('AuthService.register() — home_region parameter', () => {
    let auth, mockApi;

    beforeEach(() => {
        mockApi = App.Services.ApiService.getInstance();
        auth = App.Services.AuthService.getInstance();
    });

    test('register() sends home_region in API payload', async () => {
        mockApi.post = jest.fn().mockResolvedValue({
            data: {
                access_token: 'access-tok',
                refresh_token: 'refresh-tok',
                user: { id: 1, name: 'Test', email: 'test@test.com', home_region: 'ca' }
            }
        });

        await auth.register('Test', 'test@test.com', 'password123', 'ca');

        expect(mockApi.post).toHaveBeenCalledWith('/auth/register', {
            name: 'Test',
            email: 'test@test.com',
            password: 'password123',
            home_region: 'ca'
        });
    });

    test('register() sends US region when provided', async () => {
        mockApi.post = jest.fn().mockResolvedValue({
            data: {
                access_token: 'access-tok',
                refresh_token: 'refresh-tok',
                user: { id: 1, name: 'US User', home_region: 'us' }
            }
        });

        await auth.register('US User', 'us@test.com', 'pass1234', 'us');

        expect(mockApi.post).toHaveBeenCalledWith('/auth/register', {
            name: 'US User',
            email: 'us@test.com',
            password: 'pass1234',
            home_region: 'us'
        });
    });

    test('register() stores tokens on success', async () => {
        mockApi.post = jest.fn().mockResolvedValue({
            data: {
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                user: { id: 1, name: 'Test' }
            }
        });

        await auth.register('Test', 'test@test.com', 'password', 'ca');

        expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
        expect(localStorage.getItem('current_user')).toContain('Test');
    });

    test('register() triggers app:auth:login event', async () => {
        mockApi.post = jest.fn().mockResolvedValue({
            data: {
                access_token: 'tok',
                refresh_token: 'ref',
                user: { id: 1, name: 'Test' }
            }
        });

        const handler = jest.fn();
        $(document).on('app:auth:login', handler);

        await auth.register('Test', 'test@test.com', 'pass1234', 'ca');

        expect(handler).toHaveBeenCalled();
        $(document).off('app:auth:login', handler);
    });

    test('login() still works with original two-param signature', async () => {
        mockApi.post = jest.fn().mockResolvedValue({
            data: {
                access_token: 'tok',
                refresh_token: 'ref',
                user: { id: 1, name: 'Test' }
            }
        });

        await auth.login('test@test.com', 'password');

        expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
            email: 'test@test.com',
            password: 'password'
        });
    });
});
