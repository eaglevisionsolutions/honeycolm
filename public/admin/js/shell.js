/**
 * App.Admin.Shell
 * Initializes the admin panel shell:
 *  - Active nav item highlighting based on current URL
 *  - Sidebar collapse/expand with localStorage persistence
 *  - Logout handler
 *  - Staff name in header decoded from the admin JWT payload
 *  - Mobile hamburger overlay nav
 */

'use strict';

window.App       = window.App       || {};
window.App.Admin = window.App.Admin || {};

App.Admin.Shell = class Shell {

    static get COLLAPSED_KEY() {
        return 'adminSidebarCollapsed';
    }

    // -------------------------
    // Initialise
    // -------------------------

    /**
     * Wire up the entire admin shell.
     * Call once DOM is ready (place script at bottom of <body>
     * or wrap in DOMContentLoaded).
     */
    static init() {
        App.Admin.Shell._setActiveNav();
        App.Admin.Shell._restoreCollapseState();
        App.Admin.Shell._bindCollapseToggle();
        App.Admin.Shell._bindLogout();
        App.Admin.Shell._populateStaffName();
        App.Admin.Shell._bindHamburger();
    }

    // -------------------------
    // Active nav state
    // -------------------------

    /**
     * Adds .active to the sidebar link whose data-page attribute
     * matches the current URL path segment.
     */
    static _setActiveNav() {
        const path = window.location.pathname;   // e.g. /admin/swarms.html
        const links = document.querySelectorAll('.sidebar-link[data-page]');

        links.forEach((link) => {
            const page = link.getAttribute('data-page');

            // Dashboard: match /admin/ or /admin/index.html exactly
            if (page === 'dashboard') {
                if (path === '/admin/' || path === '/admin/index.html' || path === '/admin') {
                    link.classList.add('active');
                }
                return;
            }

            // Other pages: match if the path contains the page slug
            if (path.includes('/' + page)) {
                link.classList.add('active');
            }
        });
    }

    // -------------------------
    // Sidebar collapse
    // -------------------------

    /**
     * Restore the collapse state saved from a previous session.
     * On tablet (<1024px) the sidebar starts collapsed by default
     * unless the user has explicitly expanded it.
     */
    static _restoreCollapseState() {
        const sidebar = document.getElementById('admin-sidebar');
        if (!sidebar) return;

        const isTablet  = window.innerWidth < 1024;
        const stored    = localStorage.getItem(App.Admin.Shell.COLLAPSED_KEY);

        if (isTablet) {
            // Tablet default: collapsed unless user stored 'expanded'
            if (stored !== 'expanded') {
                // Already collapsed via CSS; remove any expanded class
                sidebar.classList.remove('tablet-expanded');
            } else {
                sidebar.classList.add('tablet-expanded');
            }
        } else {
            // Desktop: collapsed only if user explicitly stored 'collapsed'
            if (stored === 'collapsed') {
                sidebar.classList.add('admin-sidebar--collapsed');
            }
        }
    }

    /**
     * Wire the collapse/expand toggle button.
     */
    static _bindCollapseToggle() {
        const btn     = document.getElementById('sidebar-collapse');
        const sidebar = document.getElementById('admin-sidebar');
        if (!btn || !sidebar) return;

        btn.addEventListener('click', () => {
            const isTablet = window.innerWidth < 1024;

            if (isTablet) {
                const expanded = sidebar.classList.toggle('tablet-expanded');
                localStorage.setItem(
                    App.Admin.Shell.COLLAPSED_KEY,
                    expanded ? 'expanded' : 'collapsed'
                );
            } else {
                const collapsed = sidebar.classList.toggle('admin-sidebar--collapsed');
                localStorage.setItem(
                    App.Admin.Shell.COLLAPSED_KEY,
                    collapsed ? 'collapsed' : 'expanded'
                );
            }
        });
    }

    // -------------------------
    // Logout
    // -------------------------

    static _bindLogout() {
        const btn = document.getElementById('logout-btn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            App.Admin.AuthService.logout();
            window.location.href = '/admin/login.html';
        });
    }

    // -------------------------
    // Staff name from JWT
    // -------------------------

    /**
     * Base64-decode the JWT payload section and read the .name field.
     * Updates #header-staff-name and any .sidebar-staff-name / .sidebar-staff-role
     * elements in the sidebar bottom area.
     */
    static _populateStaffName() {
        const token = App.Admin.AuthService.getToken();
        if (!token) return;

        try {
            const parts = token.split('.');
            if (parts.length < 2) return;

            // JWT payload is base64url-encoded — pad and decode
            let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad  = base64.length % 4;
            if (pad === 2) base64 += '==';
            else if (pad === 3) base64 += '=';

            const payload = JSON.parse(atob(base64));

            const name = payload.name || payload.email || 'Staff';
            const role = payload.role || 'Staff Member';

            const headerNameEl = document.getElementById('header-staff-name');
            if (headerNameEl) {
                headerNameEl.textContent = name;
            }

            const sidebarNameEl = document.querySelector('.sidebar-staff-name');
            if (sidebarNameEl) {
                sidebarNameEl.textContent = name;
            }

            const sidebarRoleEl = document.querySelector('.sidebar-staff-role');
            if (sidebarRoleEl) {
                sidebarRoleEl.textContent = App.Admin.Shell._formatRole(role);
            }

            const avatarEl = document.querySelector('.sidebar-staff-avatar');
            if (avatarEl) {
                avatarEl.textContent = name.charAt(0).toUpperCase();
            }
        } catch (_) {
            // JWT decode failure is non-fatal — shell still renders
        }
    }

    /**
     * Convert snake_case/lowercase role to a human-readable label.
     * @param {string} role
     * @returns {string}
     */
    static _formatRole(role) {
        const map = {
            super_admin: 'Super Admin',
            admin:       'Admin',
            staff:       'Staff Member'
        };
        return map[role] || role;
    }

    // -------------------------
    // Mobile hamburger
    // -------------------------

    static _bindHamburger() {
        const hamburger = document.getElementById('header-hamburger');
        const sidebar   = document.getElementById('admin-sidebar');
        const backdrop  = document.getElementById('admin-sidebar-backdrop');
        if (!hamburger || !sidebar) return;

        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            if (backdrop) {
                backdrop.classList.toggle('visible');
            }
        });

        if (backdrop) {
            backdrop.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                backdrop.classList.remove('visible');
            });
        }
    }
};
