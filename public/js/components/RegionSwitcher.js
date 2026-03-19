/**
 * App.Components.RegionSwitcher
 * Fetches available regions from GET /api/v1/regions and renders
 * a dropdown in the #region-switcher nav slot.
 *
 * On region selection it:
 *   1. Replaces the /ca/ or /us/ prefix in the current URL pathname.
 *   2. Sets a region cookie so the server can read the preference.
 *   3. Navigates to the new URL.
 */

'use strict';

window.App = window.App || {};
App.Components = App.Components || {};

class RegionSwitcher {
    /**
     * Initialise the region switcher.
     * Fetches regions and renders the dropdown into #region-switcher.
     * @returns {void}
     */
    static init() {
        const container = document.getElementById('region-switcher');
        if (!container) { return; }

        App.Services.ApiService.getInstance()
            .get('/regions')
            .then(function (response) {
                if (!response || !response.data) { return; }
                const regions = Array.isArray(response.data) ? response.data : [];
                RegionSwitcher._render(container, regions);
            })
            .catch(function () {
                // Regions endpoint unavailable — render a minimal fallback.
                RegionSwitcher._render(container, [
                    { code: 'ca', name: 'Canada', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
                ]);
            });
    }

    /**
     * Render the region switcher widget into the given container element.
     * @param {HTMLElement} container
     * @param {Array<{code: string, name: string, flag: string}>} regions
     * @returns {void}
     */
    static _render(container, regions) {
        const currentRegion = RegionSwitcher._currentRegion();

        const activeRegion = regions.find(function (r) {
            return r.code === currentRegion;
        }) || regions[0];

        if (!activeRegion) { return; }

        const flagDisplay = activeRegion.flag || '';
        const nameDisplay = activeRegion.name || activeRegion.code.toUpperCase();

        const optionsHtml = regions.map(function (r) {
            const isActive = r.code === (activeRegion ? activeRegion.code : '');
            const activeClass = isActive ? ' is-active' : '';
            const flag = r.flag || '';
            return `<div class="region-switcher__option${activeClass}" data-region="${RegionSwitcher._escapeAttr(r.code)}">`
                + `${flag} ${RegionSwitcher._escape(r.name)}`
                + `</div>`;
        }).join('');

        container.innerHTML = `<div class="region-switcher">`
            + `<button class="region-switcher__btn" id="region-switcher-btn" aria-haspopup="listbox" aria-expanded="false">`
            + `${flagDisplay} ${RegionSwitcher._escape(nameDisplay)}`
            + `</button>`
            + `<div class="region-switcher__dropdown" id="region-switcher-dropdown" role="listbox">`
            + optionsHtml
            + `</div>`
            + `</div>`;

        const btn      = document.getElementById('region-switcher-btn');
        const dropdown = document.getElementById('region-switcher-dropdown');

        if (!btn || !dropdown) { return; }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('is-open');
            dropdown.classList.toggle('is-open', !isOpen);
            btn.setAttribute('aria-expanded', String(!isOpen));
        });

        document.addEventListener('click', function () {
            dropdown.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });

        const options = dropdown.querySelectorAll('.region-switcher__option');
        options.forEach(function (option) {
            option.addEventListener('click', function (e) {
                e.stopPropagation();
                const code = option.getAttribute('data-region');
                RegionSwitcher._switchRegion(code);
            });
        });
    }

    /**
     * Read the current region from the URL pathname.
     * Falls back to the region cookie, then 'ca'.
     * @returns {string}
     */
    static _currentRegion() {
        const match = window.location.pathname.match(/^\/([a-z]{2})\//);
        if (match) { return match[1]; }

        const cookieMatch = document.cookie.match(/(?:^|;)\s*region=([a-z]{2})/);
        if (cookieMatch) { return cookieMatch[1]; }

        return 'ca';
    }

    /**
     * Switch to a different region: update the cookie and navigate.
     * @param {string} code  e.g. 'ca' or 'us'
     * @returns {void}
     */
    static _switchRegion(code) {
        document.cookie = `region=${code}; path=/; max-age=31536000; SameSite=Lax`;

        const pathname = window.location.pathname;
        const regionPattern = /^\/([a-z]{2})(\/.*)?$/;
        const match = pathname.match(regionPattern);

        let newPath;
        if (match) {
            newPath = `/${code}${match[2] || '/'}`;
        } else {
            newPath = `/${code}/`;
        }

        window.location.href = newPath + window.location.search + window.location.hash;
    }

    /**
     * Escape a string for safe HTML text insertion.
     * @param {string} str
     * @returns {string}
     */
    static _escape(str) {
        if (typeof str !== 'string') { return ''; }
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Escape a string for safe use in an HTML attribute value.
     * @param {string} str
     * @returns {string}
     */
    static _escapeAttr(str) {
        if (typeof str !== 'string') { return ''; }
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

App.Components.RegionSwitcher = RegionSwitcher;
