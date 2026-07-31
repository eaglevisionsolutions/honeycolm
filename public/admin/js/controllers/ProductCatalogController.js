/**
 * App.Admin.Controllers.ProductCatalogController
 * Renders the product catalogue management interface into #admin-root.
 *
 * Features:
 *  - Grid view of all products with search and category filtering
 *  - Add / edit product via modal form
 *  - Image management per product: upload, reorder, delete
 *  - Products cannot be deleted once used in a Swarm (enforced server-side;
 *    note surfaced to admin in the UI)
 *
 * API calls use this._api (App.Services.ApiService).
 * Image uploads use fetch() + FormData directly (multipart).
 * Auth token sourced from App.Services.AuthService.getInstance().getToken().
 */

'use strict';

window.App                   = window.App                   || {};
window.App.Admin             = window.App.Admin             || {};
window.App.Admin.Controllers = window.App.Admin.Controllers || {};

App.Admin.Controllers.ProductCatalogController = class ProductCatalogController {

    constructor(api) {
        /** @type {Array<Object>} Full product list from the last API fetch. */
        this._products = [];

        /** @type {string} Currently selected category filter. */
        this._activeCategory = 'all';

        /** @type {number|null} ID of the product being edited, or null when adding. */
        this._editingId = null;

        /** @type {App.Services.ApiService} Shared API service instance. */
        this._api = api || App.Services.ApiService.getInstance();

        /** @type {number|null} Debounce timer handle for the search input. */
        this._searchTimer = null;
    }

    // -------------------------
    // Public API
    // -------------------------

    /**
     * Initialise the controller.
     * Renders the page shell into #admin-root and loads the initial product list.
     */
    init() {
        this._renderShell();
        this.loadProducts();
    }

    /**
     * Fetch products from the API and refresh the grid.
     * @param {string} [search='']       - Free-text search term.
     * @param {string} [category='all']  - Category slug or 'all'.
     * @returns {Promise<void>}
     */
    async loadProducts(search = '', category = 'all') {
        const categoryParam = category === 'all' ? '' : category;
        const path = `/admin/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(categoryParam)}`;

        let products;
        try {
            const response = await this._api.get(path);
            // ApiService.get() is expected to return parsed JSON body or throw.
            // Support both { data: [...] } and bare array shapes.
            products = Array.isArray(response)
                ? response
                : (response && Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            this._showGridError('Could not load products. Please try again.');
            return;
        }

        this._products = products;
        this.renderGrid();
    }

    /**
     * Render product cards into #catalog-grid.
     */
    renderGrid() {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;

        if (!this._products || this._products.length === 0) {
            grid.innerHTML = `
                <div class="catalog-empty" role="status">
                    <p>No products found. Click <strong>Add product</strong> to create one.</p>
                </div>`;
            return;
        }

        grid.innerHTML = this._products.map((product) => this._productCardHtml(product)).join('');

        // Attach edit-button listeners
        grid.querySelectorAll('.product-card__edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.productId, 10);
                this.openEditModal(id);
            });
        });
    }

    /**
     * Open the modal in "add" mode.
     */
    openAddModal() {
        this._editingId = null;
        this.renderProductModal(null);
    }

    /**
     * Open the modal in "edit" mode for the given product ID.
     * @param {number} id
     */
    openEditModal(id) {
        this._editingId = id;
        const product = this._products.find((p) => p.id === id) || null;
        this.renderProductModal(product);
    }

    /**
     * Render the add/edit modal overlay and attach all event handlers.
     * @param {Object|null} product - Existing product data, or null when adding.
     */
    renderProductModal(product) {
        // Remove any stale overlay first
        this._removeModal();

        const isEdit      = product !== null;
        const title       = isEdit ? 'Edit product' : 'Add product';
        const name        = isEdit ? this._escHtml(product.name        || '') : '';
        const brand       = isEdit ? this._escHtml(product.brand       || '') : '';
        const category    = isEdit ? (product.category    || '')              : '';
        const retailValue = isEdit ? (product.retail_value || '')             : '';
        const description = isEdit ? this._escHtml(product.description || '') : '';

        const categories = ['Electronics', 'Fashion', 'Gaming', 'Experiences', 'Collectibles'];
        const categoryOptions = categories.map((cat) => {
            const val      = cat.toLowerCase();
            const selected = val === category.toLowerCase() ? ' selected' : '';
            return `<option value="${val}"${selected}>${this._escHtml(cat)}</option>`;
        }).join('');

        // Build image list section for edit mode
        let imagesSection = '';
        if (isEdit) {
            imagesSection = this._buildImageListHtml(product);
        }

        const overlay = document.createElement('div');
        overlay.className = 'admin-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', title);

        overlay.innerHTML = `
            <div class="admin-modal">
                <div class="admin-modal__header">
                    <h2 class="admin-modal__title">${this._escHtml(title)}</h2>
                    <button class="admin-modal__close-btn" aria-label="Close modal" type="button">&times;</button>
                </div>

                <div class="admin-modal__body">
                    <form id="product-form" novalidate>
                        <div class="form-group">
                            <label class="form-label" for="product-name">Name</label>
                            <input
                                class="form-control"
                                id="product-name"
                                name="name"
                                type="text"
                                value="${name}"
                                required
                                autocomplete="off"
                            />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="product-brand">Brand</label>
                            <input
                                class="form-control"
                                id="product-brand"
                                name="brand"
                                type="text"
                                value="${brand}"
                                autocomplete="off"
                            />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="product-category">Category</label>
                            <select class="form-control" id="product-category" name="category" required>
                                <option value="">— Select category —</option>
                                ${categoryOptions}
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="product-retail-value">Retail value (Nt)</label>
                            <input
                                class="form-control"
                                id="product-retail-value"
                                name="retail_value"
                                type="number"
                                min="0"
                                step="1"
                                value="${retailValue}"
                            />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="product-description">Description</label>
                            <textarea
                                class="form-control"
                                id="product-description"
                                name="description"
                                rows="4"
                            >${description}</textarea>
                        </div>

                        ${imagesSection}

                        <div class="admin-modal__form-error" id="modal-error" role="alert" style="display:none;"></div>
                    </form>
                </div>

                <div class="admin-modal__footer">
                    <button class="btn btn--secondary" id="modal-cancel-btn" type="button">Cancel</button>
                    <button class="btn btn--primary"   id="modal-save-btn"   type="button">Save product</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // --- Close / cancel ---
        const closeModal = () => this._removeModal();
        overlay.querySelector('.admin-modal__close-btn').addEventListener('click', closeModal);
        overlay.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);

        // Close on backdrop click (not on modal content itself)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // --- Save ---
        overlay.querySelector('#modal-save-btn').addEventListener('click', () => {
            this.saveProduct();
        });

        // --- Image upload (edit mode only) ---
        if (isEdit) {
            this._bindImageUpload(product.id);
            this._bindImageActions(product.id);
        }

        // Focus the first field
        const firstInput = overlay.querySelector('#product-name');
        if (firstInput) firstInput.focus();
    }

    /**
     * Save the product (create or update) using form values from the open modal.
     * @returns {Promise<void>}
     */
    async saveProduct() {
        const nameEl     = document.getElementById('product-name');
        const brandEl    = document.getElementById('product-brand');
        const categoryEl = document.getElementById('product-category');
        const valueEl    = document.getElementById('product-retail-value');
        const descEl     = document.getElementById('product-description');
        const errorEl    = document.getElementById('modal-error');
        const saveBtn    = document.getElementById('modal-save-btn');

        if (!nameEl) return;

        const name        = nameEl.value.trim();
        const brand       = brandEl     ? brandEl.value.trim()      : '';
        const category    = categoryEl  ? categoryEl.value          : '';
        const retail_value = valueEl    ? Number(valueEl.value)     : 0;
        const description = descEl      ? descEl.value.trim()       : '';

        // Basic client-side validation
        if (!name) {
            this._showModalError('Product name is required.');
            nameEl.focus();
            return;
        }
        if (!category) {
            this._showModalError('Please select a category.');
            if (categoryEl) categoryEl.focus();
            return;
        }

        const payload = { name, brand, category, retail_value, description };

        if (saveBtn) {
            saveBtn.disabled    = true;
            saveBtn.textContent = 'Saving…';
        }

        try {
            if (!this._editingId) {
                // Create
                await this._api.mutate('POST', '/admin/products', payload);
            } else {
                // Update
                await this._api.mutate('PATCH', `/admin/products/${this._editingId}`, payload);
            }
        } catch (err) {
            const message = (err && err.message) ? err.message : 'Failed to save product. Please try again.';
            this._showModalError(message);
            if (saveBtn) {
                saveBtn.disabled    = false;
                saveBtn.textContent = 'Save product';
            }
            return;
        }

        this._removeModal();

        // Preserve current filter state when refreshing
        const searchInput = document.getElementById('catalog-search');
        const search      = searchInput ? searchInput.value.trim() : '';
        this.loadProducts(search, this._activeCategory);
    }

    /**
     * Upload an image file for the given product.
     * Uses fetch() + FormData directly (ApiService does not support multipart).
     * @param {number} productId
     * @param {File}   file
     * @returns {Promise<void>}
     */
    async uploadImage(productId, file) {
        const token = App.Services.AuthService.getInstance().getToken();

        const formData = new FormData();
        formData.append('image', file);

        let response;
        try {
            response = await fetch(`/api/v1/admin/products/${productId}/images`, {
                method:  'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body:    formData
            });
        } catch (err) {
            this._showModalError('Image upload failed — network error.');
            return;
        }

        let body;
        try { body = await response.json(); } catch (_) { body = {}; }

        if (!response.ok) {
            const message = (body && body.message) ? body.message : 'Image upload failed.';
            this._showModalError(message);
            return;
        }

        // Refresh the image list inside the still-open modal
        await this._refreshModalImages(productId);
    }

    /**
     * Reorder a product image one step up or down.
     * @param {number} productId
     * @param {number} imageId
     * @param {'up'|'down'} direction
     * @returns {Promise<void>}
     */
    async reorderImage(productId, imageId, direction) {
        try {
            await this._api.mutate('PATCH', `/admin/products/${productId}/images/reorder`, {
                image_id: imageId,
                direction
            });
        } catch (err) {
            this._showModalError('Could not reorder image. Please try again.');
            return;
        }

        await this._refreshModalImages(productId);
    }

    /**
     * Prompt for confirmation then delete the specified image.
     * @param {number} productId
     * @param {number} imageId
     * @returns {Promise<void>}
     */
    async deleteImage(productId, imageId) {
        // Inline confirmation — replace the image row actions with a confirm prompt
        const row = document.querySelector(`.image-list-item[data-image-id="${imageId}"]`);
        if (!row) return;

        const actionsEl = row.querySelector('.image-list-item__actions');
        if (!actionsEl) return;

        const originalHtml = actionsEl.innerHTML;

        actionsEl.innerHTML = `
            <span class="image-delete-confirm__label">Delete this image?</span>
            <button class="btn btn--danger btn--sm image-delete-confirm__yes" type="button">Yes, delete</button>
            <button class="btn btn--secondary btn--sm image-delete-confirm__no"  type="button">Cancel</button>`;

        actionsEl.querySelector('.image-delete-confirm__no').addEventListener('click', () => {
            actionsEl.innerHTML = originalHtml;
            this._bindImageActions(productId);
        });

        actionsEl.querySelector('.image-delete-confirm__yes').addEventListener('click', async () => {
            try {
                await this._api.mutate('DELETE', `/admin/products/${productId}/images/${imageId}`, null);
            } catch (err) {
                this._showModalError('Could not delete image. Please try again.');
                actionsEl.innerHTML = originalHtml;
                this._bindImageActions(productId);
                return;
            }

            await this._refreshModalImages(productId);
        });
    }

    // -------------------------
    // Private: page shell
    // -------------------------

    /**
     * Render the static page shell into #admin-root.
     */
    _renderShell() {
        const root = document.getElementById('admin-root');
        if (!root) return;

        const categories = ['All', 'Electronics', 'Fashion', 'Gaming', 'Experiences', 'Collectibles'];

        const tabsHtml = categories.map((cat) => {
            const val        = cat.toLowerCase();
            const isActive   = val === this._activeCategory;
            const activeAttr = isActive ? ' aria-current="true"' : '';
            return `<button
                class="catalog-filter-tab${isActive ? ' catalog-filter-tab--active' : ''}"
                data-category="${val}"
                type="button"
                ${activeAttr}
            >${this._escHtml(cat)}</button>`;
        }).join('');

        root.innerHTML = `
            <div class="catalog-header">
                <h1 class="catalog-title">Product Catalogue</h1>
                <button class="btn btn--primary" id="add-product-btn" type="button">Add product</button>
            </div>

            <div class="catalog-toolbar">
                <input
                    class="form-control catalog-search"
                    id="catalog-search"
                    type="search"
                    placeholder="Search products…"
                    aria-label="Search products"
                    autocomplete="off"
                />
                <div class="catalog-filter-tabs" role="tablist" aria-label="Filter by category">
                    ${tabsHtml}
                </div>
            </div>

            <p class="catalog-delete-notice">
                Note: Products cannot be deleted once used in a Swarm.
            </p>

            <div class="product-catalog-grid" id="catalog-grid" aria-live="polite">
                <p class="catalog-loading">Loading products&hellip;</p>
            </div>`;

        // --- Add product button ---
        root.querySelector('#add-product-btn').addEventListener('click', () => {
            this.openAddModal();
        });

        // --- Category filter tabs ---
        root.querySelectorAll('.catalog-filter-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                this._activeCategory = tab.dataset.category;

                // Update active state on all tabs
                root.querySelectorAll('.catalog-filter-tab').forEach((t) => {
                    const isActive = t.dataset.category === this._activeCategory;
                    t.classList.toggle('catalog-filter-tab--active', isActive);
                    if (isActive) {
                        t.setAttribute('aria-current', 'true');
                    } else {
                        t.removeAttribute('aria-current');
                    }
                });

                const searchInput = document.getElementById('catalog-search');
                const search      = searchInput ? searchInput.value.trim() : '';
                this.loadProducts(search, this._activeCategory);
            });
        });

        // --- Search input with 300 ms debounce ---
        const searchInput = root.querySelector('#catalog-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this.loadProducts(searchInput.value.trim(), this._activeCategory);
                }, 300);
            });
        }
    }

    // -------------------------
    // Private: card rendering
    // -------------------------

    /**
     * Build the HTML for a single product card.
     * @param {Object} product
     * @returns {string}
     */
    _productCardHtml(product) {
        const id          = product.id || '';
        const name        = this._escHtml(product.name        || 'Unnamed product');
        const brand       = this._escHtml(product.brand       || '');
        const category    = this._escHtml(product.category    || '');
        const retailValue = this._formatNectar(product.retail_value || 0);
        const timesUsed   = parseInt(product.times_used, 10) || 0;

        // First image or a placeholder
        const images   = Array.isArray(product.images) ? product.images : [];
        const imgSrc   = images.length > 0 ? this._escHtml(images[0].url || images[0]) : null;
        const imgHtml  = imgSrc
            ? `<img class="product-card__image" src="${imgSrc}" alt="${name}" loading="lazy" />`
            : `<div class="product-card__image-placeholder" aria-hidden="true">No image</div>`;

        const categoryBadge = category
            ? `<span class="product-card__category-badge">${category}</span>`
            : '';

        return `
            <article class="product-card" data-product-id="${id}">
                <div class="product-card__image-wrap">
                    ${imgHtml}
                </div>
                <div class="product-card__body">
                    <div class="product-card__meta-row">
                        ${categoryBadge}
                    </div>
                    <h3 class="product-card__name">${name}</h3>
                    ${brand ? `<p class="product-card__brand">${brand}</p>` : ''}
                    <p class="product-card__retail-value">${retailValue}</p>
                    <p class="product-card__times-used">Times used: ${timesUsed}</p>
                </div>
                <div class="product-card__footer">
                    <button
                        class="btn btn--secondary btn--sm product-card__edit-btn"
                        data-product-id="${id}"
                        type="button"
                        aria-label="Edit ${name}"
                    >Edit</button>
                </div>
            </article>`;
    }

    // -------------------------
    // Private: modal helpers
    // -------------------------

    /**
     * Build the HTML for the image management section inside the edit modal.
     * @param {Object} product
     * @returns {string}
     */
    _buildImageListHtml(product) {
        const images = Array.isArray(product.images) ? product.images : [];

        const imageRowsHtml = images.length === 0
            ? '<p class="image-list-empty">No images yet.</p>'
            : images.map((img, index) => {
                const imgId  = img.id;
                const imgSrc = this._escHtml(img.url || img);
                const isFirst = index === 0;
                const isLast  = index === images.length - 1;

                return `<li class="image-list-item" data-image-id="${imgId}">
                    <img class="image-list-item__thumb" src="${imgSrc}" alt="Product image ${index + 1}" />
                    <div class="image-list-item__actions">
                        <button
                            class="btn btn--secondary btn--sm img-reorder-up"
                            data-image-id="${imgId}"
                            type="button"
                            ${isFirst ? 'disabled' : ''}
                            aria-label="Move image up"
                        >&uarr;</button>
                        <button
                            class="btn btn--secondary btn--sm img-reorder-down"
                            data-image-id="${imgId}"
                            type="button"
                            ${isLast ? 'disabled' : ''}
                            aria-label="Move image down"
                        >&darr;</button>
                        <button
                            class="btn btn--danger btn--sm img-delete"
                            data-image-id="${imgId}"
                            type="button"
                            aria-label="Delete image"
                        >Delete</button>
                    </div>
                </li>`;
            }).join('');

        return `
            <div class="product-images-section" id="product-images-section">
                <h3 class="product-images-section__title">Images</h3>
                <ul class="image-list" id="product-image-list">
                    ${imageRowsHtml}
                </ul>

                <div class="form-group image-upload-group">
                    <label class="form-label" for="product-image-upload">Upload new image</label>
                    <input
                        class="form-control-file"
                        id="product-image-upload"
                        name="image"
                        type="file"
                        accept="image/*"
                    />
                    <button class="btn btn--secondary btn--sm" id="upload-image-btn" type="button">Upload</button>
                </div>
            </div>`;
    }

    /**
     * Bind the upload-button click handler.
     * @param {number} productId
     */
    _bindImageUpload(productId) {
        const uploadBtn   = document.getElementById('upload-image-btn');
        const fileInput   = document.getElementById('product-image-upload');
        if (!uploadBtn || !fileInput) return;

        uploadBtn.addEventListener('click', () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                this._showModalError('Please select an image file first.');
                return;
            }
            uploadBtn.disabled    = true;
            uploadBtn.textContent = 'Uploading…';
            this.uploadImage(productId, file).finally(() => {
                uploadBtn.disabled    = false;
                uploadBtn.textContent = 'Upload';
                fileInput.value       = '';
            });
        });
    }

    /**
     * Bind reorder and delete button handlers on all image list rows.
     * @param {number} productId
     */
    _bindImageActions(productId) {
        const list = document.getElementById('product-image-list');
        if (!list) return;

        list.querySelectorAll('.img-reorder-up').forEach((btn) => {
            btn.addEventListener('click', () => {
                const imageId = parseInt(btn.dataset.imageId, 10);
                this.reorderImage(productId, imageId, 'up');
            });
        });

        list.querySelectorAll('.img-reorder-down').forEach((btn) => {
            btn.addEventListener('click', () => {
                const imageId = parseInt(btn.dataset.imageId, 10);
                this.reorderImage(productId, imageId, 'down');
            });
        });

        list.querySelectorAll('.img-delete').forEach((btn) => {
            btn.addEventListener('click', () => {
                const imageId = parseInt(btn.dataset.imageId, 10);
                this.deleteImage(productId, imageId);
            });
        });
    }

    /**
     * Re-fetch the product and re-render only the image section inside the open modal.
     * Silently does nothing if the modal is no longer open.
     * @param {number} productId
     * @returns {Promise<void>}
     */
    async _refreshModalImages(productId) {
        const section = document.getElementById('product-images-section');
        if (!section) return;

        let product;
        try {
            const response = await this._api.get(`/admin/products/${productId}`);
            product = (response && response.data) ? response.data : response;
        } catch (_) {
            this._showModalError('Could not refresh image list.');
            return;
        }

        // Update the cached product entry so the grid stays in sync
        const idx = this._products.findIndex((p) => p.id === productId);
        if (idx !== -1) this._products[idx] = product;

        section.outerHTML = this._buildImageListHtml(product);

        // Re-bind after replacing the DOM node
        this._bindImageUpload(productId);
        this._bindImageActions(productId);
    }

    /**
     * Remove the modal overlay from the DOM.
     */
    _removeModal() {
        const overlay = document.querySelector('.admin-modal-overlay');
        if (overlay) overlay.remove();
    }

    /**
     * Display an error message inside the open modal.
     * @param {string} message
     */
    _showModalError(message) {
        const el = document.getElementById('modal-error');
        if (!el) return;
        el.textContent    = message;
        el.style.display  = 'block';
    }

    /**
     * Display a grid-level error message inside #catalog-grid.
     * @param {string} message
     */
    _showGridError(message) {
        const grid = document.getElementById('catalog-grid');
        if (!grid) return;
        grid.innerHTML = `<div class="catalog-error" role="alert">${this._escHtml(message)}</div>`;
    }

    // -------------------------
    // Private: formatting
    // -------------------------

    /**
     * Format a Nectar value with the Nt prefix and locale thousand separators.
     * e.g. 45800 → "Nt 45,800"
     * @param {number} n
     * @returns {string}
     */
    _formatNectar(n) {
        const num = parseInt(n, 10);
        if (isNaN(num)) return 'Nt 0';
        return 'Nt ' + num.toLocaleString('en-CA');
    }

    /**
     * Escape a string for safe HTML insertion.
     * @param {string} str
     * @returns {string}
     */
    _escHtml(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }
};
