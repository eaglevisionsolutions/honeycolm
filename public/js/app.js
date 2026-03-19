/**
 * App Namespace Bootstrap
 * Must be loaded first before all other JS files.
 */

'use strict';

window.App = window.App || {};
App.Controllers = App.Controllers || {};
App.Services    = App.Services    || {};
App.Models      = App.Models      || {};
App.Utils       = App.Utils       || {};
App.Components  = App.Components  || {};
App.Config      = App.Config      || {
    apiBase:    '/api/v1',
    debug:      false,
    version:    '1.0.0',
};

/**
 * Application entry point.
 * Called once the DOM is ready.
 */
App.init = function () {
    // Boot core services
    App.Services.SyncService.getInstance().init();

    // Register service worker
    App.Utils.ServiceWorkerUtil.register('/sw.js');

    if (typeof App.Components.RegionSwitcher !== 'undefined') {
        App.Components.RegionSwitcher.init();
    }

    // URL-path-based controller initialization
    App._initRouteController();

    if (App.Config.debug) {
        console.info('[App] Initialized v' + App.Config.version);
    }
};

/**
 * Route-based controller initialization.
 * Reads window.location.pathname and boots the appropriate controller.
 */
App._initRouteController = function () {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';

    if (path === '/ca/swarms') {
        const ctrl = new App.Controllers.ActiveSwarmsController();
        ctrl.init();
    } else if (/^\/ca\/swarms\/\d+$/.test(path)) {
        const ctrl = new App.Controllers.SwarmDetailController();
        ctrl.init();
    }
    // Additional route controllers will be added here as they are built.
    // The HomeController currently self-boots via its own $(function) block.
};

$(document).ready(function () {
    App.init();
});
