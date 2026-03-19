/**
 * Test setup — mock browser globals and load App namespace + services.
 * Used by all frontend controller tests.
 */

const $ = require('jquery');
global.$ = global.jQuery = $;

// Mock localStorage
const storage = {};
global.localStorage = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val); },
    removeItem: (key) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
};

// Mock navigator
global.navigator = { onLine: true };

// Mock document.cookie
Object.defineProperty(global.document, 'cookie', {
    get: () => '',
    set: () => {},
    configurable: true,
});

// Set up App namespace
global.window.App = global.App = {
    Controllers: {},
    Services: {},
    Models: {},
    Utils: {},
    Components: {},
    Config: { apiBase: '/api/v1', debug: false, version: '1.0.0' },
};

// Load source files in dependency order
require('../../public/js/services/ApiService.js');
require('../../public/js/services/AuthService.js');
require('../../public/js/utils/Validator.js');
require('../../public/js/controllers/BaseController.js');
require('../../public/js/controllers/LoginController.js');
require('../../public/js/controllers/RegisterController.js');

// Mock SyncService (required by BaseController but not relevant here)
App.Services.SyncService = {
    getInstance: () => ({ init: () => {}, enqueue: () => {} }),
};

// Reset singletons between tests
beforeEach(() => {
    App.Services.ApiService._instance = null;
    App.Services.AuthService._instance = null;
    localStorage.clear();
    document.body.innerHTML = '<div id="app-root"></div><div id="notifications"></div>';
});
