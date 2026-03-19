/**
 * App.Utils.ServiceWorkerUtil
 * Service worker registration and update handling.
 */

'use strict';

App.Utils.ServiceWorkerUtil = class ServiceWorkerUtil {

    static async register(swPath = '/sw.js') {
        if (!('serviceWorker' in navigator)) {
            if (App.Config.debug) {
                console.warn('[SW] Service workers not supported in this browser.');
            }
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register(swPath);

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;

                newWorker.addEventListener('statechange', () => {
                    if (
                        newWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        // New version available
                        $(document).trigger('app:sw:update-available', [registration]);

                        if (App.Config.debug) {
                            console.info('[SW] New version available.');
                        }
                    }
                });
            });

            if (App.Config.debug) {
                console.info('[SW] Registered:', registration.scope);
            }

            return registration;
        } catch (err) {
            console.error('[SW] Registration failed:', err);
        }
    }

    /**
     * Skip waiting and reload to activate new service worker.
     */
    static async activateUpdate(registration) {
        if (registration && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
};
