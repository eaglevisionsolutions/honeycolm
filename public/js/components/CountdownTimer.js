/**
 * App.Components.CountdownTimer
 * Provides live countdown timer rendering and DOM updates.
 *
 * Static methods:
 *   renderInline(deadline) — returns an HTML string for a countdown pill badge.
 *   startAll()             — finds all .countdown-timer[data-deadline] in the DOM
 *                            and refreshes them every 30 seconds.
 */

'use strict';

window.App = window.App || {};
App.Components = App.Components || {};

class CountdownTimer {
    /**
     * Return the HTML string for a countdown timer pill badge.
     * Adds the `urgent` class when fewer than 3600 seconds remain.
     *
     * @param {string} deadline  ISO 8601 date-time string
     * @returns {string}  HTML string
     */
    static renderInline(deadline) {
        const { label, urgent, expired } = CountdownTimer._compute(deadline);

        let classes = 'countdown-timer';
        if (expired) { classes += ' expired'; }
        else if (urgent) { classes += ' urgent'; }

        return `<span class="${classes}" data-deadline="${CountdownTimer._escapeAttr(deadline)}">${label}</span>`;
    }

    /**
     * Find every .countdown-timer[data-deadline] element in the DOM
     * and update its text and urgency class every 30 seconds.
     *
     * Safe to call multiple times — clears any existing interval first.
     *
     * @returns {void}
     */
    static startAll() {
        if (CountdownTimer._interval) {
            clearInterval(CountdownTimer._interval);
        }

        CountdownTimer._tick();

        CountdownTimer._interval = setInterval(function () {
            CountdownTimer._tick();
        }, 30000);
    }

    /**
     * Run one update pass over all countdown timer elements in the DOM.
     * @returns {void}
     */
    static _tick() {
        const elements = document.querySelectorAll('.countdown-timer[data-deadline]');
        elements.forEach(function (el) {
            const deadline = el.getAttribute('data-deadline');
            const { label, urgent, expired } = CountdownTimer._compute(deadline);

            el.textContent = label;
            el.classList.remove('urgent', 'expired');

            if (expired) {
                el.classList.add('expired');
            } else if (urgent) {
                el.classList.add('urgent');
            }
        });
    }

    /**
     * Compute the countdown label and urgency flags for a deadline.
     *
     * @param {string} deadline  ISO 8601 date-time string
     * @returns {{ label: string, urgent: boolean, expired: boolean }}
     */
    static _compute(deadline) {
        const now = Date.now();
        const end = new Date(deadline).getTime();
        const diff = Math.floor((end - now) / 1000);

        if (isNaN(diff) || diff <= 0) {
            return { label: 'Ended', urgent: false, expired: true };
        }

        const days    = Math.floor(diff / 86400);
        const hours   = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);

        let label;
        if (days > 0) {
            label = `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            label = `${hours}h ${minutes}m`;
        } else {
            label = `${minutes}m`;
        }

        const urgent = diff < 3600;

        return { label, urgent, expired: false };
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

/** @type {number|null} */
CountdownTimer._interval = null;

App.Components.CountdownTimer = CountdownTimer;
