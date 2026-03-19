/**
 * App.Services.SyncService
 * Manages offline queue using IndexedDB.
 * Listens for online events and replays queued mutations.
 */

'use strict';

App.Services.SyncService = class SyncService {

    constructor() {
        this._dbName    = 'pwa_sync_queue';
        this._storeName = 'queue';
        this._db        = null;
        this._syncing   = false;
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    async init() {
        await this._openDb();
        this._bindEvents();

        if (navigator.onLine) {
            await this.sync();
        }

        if (App.Config.debug) {
            console.info('[SyncService] Initialized');
        }
    }

    // -------------------------
    // Public API
    // -------------------------

    /**
     * Add a failed mutation to the queue.
     * @param {{ method: string, endpoint: string, data: object|null }} item
     */
    async enqueue(item) {
        const entry = {
            ...item,
            timestamp: Date.now(),
            retries:   0,
        };

        await this._dbWrite(entry);

        if (App.Config.debug) {
            console.info('[SyncService] Queued:', entry);
        }
    }

    /**
     * Replay all queued items against the API.
     */
    async sync() {
        if (this._syncing) return;
        this._syncing = true;

        try {
            const items = await this._dbReadAll();

            if (items.length === 0) {
                this._syncing = false;
                return;
            }

            if (App.Config.debug) {
                console.info(`[SyncService] Syncing ${items.length} queued item(s)`);
            }

            for (const item of items) {
                try {
                    await App.Services.ApiService.getInstance().request(
                        item.method,
                        item.endpoint,
                        item.data
                    );
                    await this._dbDelete(item.id);
                } catch (err) {
                    if (App.Config.debug) {
                        console.warn('[SyncService] Replay failed for item', item.id, err.message);
                    }
                    // Leave in queue for next sync attempt
                }
            }

            $(document).trigger('app:sync:complete');
        } finally {
            this._syncing = false;
        }
    }

    async queueCount() {
        const items = await this._dbReadAll();
        return items.length;
    }

    // -------------------------
    // Event listeners
    // -------------------------

    _bindEvents() {
        window.addEventListener('online', async () => {
            if (App.Config.debug) {
                console.info('[SyncService] Connection restored. Syncing...');
            }
            $(document).trigger('app:online');
            await this.sync();
        });

        window.addEventListener('offline', () => {
            if (App.Config.debug) {
                console.info('[SyncService] Connection lost. Requests will be queued.');
            }
            $(document).trigger('app:offline');
        });
    }

    // -------------------------
    // IndexedDB helpers
    // -------------------------

    _openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this._dbName, 1);

            req.onupgradeneeded = (e) => {
                const db    = e.target.result;
                const store = db.createObjectStore(this._storeName, {
                    keyPath:       'id',
                    autoIncrement: true,
                });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            };

            req.onsuccess = (e) => {
                this._db = e.target.result;
                resolve();
            };

            req.onerror = () => reject(req.error);
        });
    }

    _dbWrite(item) {
        return new Promise((resolve, reject) => {
            const tx    = this._db.transaction(this._storeName, 'readwrite');
            const req   = tx.objectStore(this._storeName).add(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    _dbReadAll() {
        return new Promise((resolve, reject) => {
            const tx  = this._db.transaction(this._storeName, 'readonly');
            const req = tx.objectStore(this._storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    _dbDelete(id) {
        return new Promise((resolve, reject) => {
            const tx  = this._db.transaction(this._storeName, 'readwrite');
            const req = tx.objectStore(this._storeName).delete(id);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }
};

// Singleton
App.Services.SyncService._instance = null;
App.Services.SyncService.getInstance = function () {
    if (!App.Services.SyncService._instance) {
        App.Services.SyncService._instance = new App.Services.SyncService();
    }
    return App.Services.SyncService._instance;
};
