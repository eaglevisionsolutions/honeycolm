/**
 * App.Components.SwarmCard
 * Renders a swarm card HTML string given a swarm data object.
 * Used on the homepage and active swarms browse page.
 */

'use strict';

window.App = window.App || {};
App.Components = App.Components || {};

class SwarmCard {
    /**
     * Render a swarm card HTML string.
     *
     * @param {Object} swarm
     * @param {number}  swarm.id
     * @param {string}  swarm.title
     * @param {Object}  swarm.product
     * @param {string}  swarm.product.name
     * @param {number}  swarm.product.retail_value
     * @param {number}  swarm.comb_price
     * @param {number}  swarm.comb_count
     * @param {number}  swarm.combs_sold
     * @param {number}  swarm.member_odds  0 if not authenticated
     * @param {string}  swarm.deadline     ISO 8601 string
     * @param {string}  swarm.status       active | filling_fast | full | draw_complete | expired | cancelled | draft
     * @returns {string} HTML string
     */
    static render(swarm) {
        const fillPct = swarm.comb_count > 0
            ? Math.min(100, Math.round((swarm.combs_sold / swarm.comb_count) * 100))
            : 0;

        const combsRemaining = swarm.comb_count - swarm.combs_sold;

        const oddsHtml = swarm.member_odds > 0
            ? `<span class="swarm-card__odds swarm-card__odds--live">Your odds: ${swarm.member_odds}%</span>`
            : `<span class="swarm-card__odds">Login to see your odds</span>`;

        const timerHtml = App.Components.CountdownTimer.renderInline(swarm.deadline);

        const badgeClass = SwarmCard._badgeClass(swarm.status);
        const badgeLabel = SwarmCard._badgeLabel(swarm.status);

        const productName = swarm.product ? swarm.product.name : swarm.title;
        const retailValue = swarm.product && swarm.product.retail_value
            ? `<span class="swarm-card__retail">Nt ${swarm.product.retail_value}</span>`
            : '';

        const imageSrc = swarm.product && swarm.product.image_url
            ? swarm.product.image_url
            : '';

        const imageHtml = imageSrc
            ? `<div class="swarm-card__image"><img src="${SwarmCard._escape(imageSrc)}" alt="${SwarmCard._escape(productName)}" loading="lazy"></div>`
            : `<div class="swarm-card__image" aria-hidden="true"></div>`;

        return `<article class="swarm-card" data-swarm-id="${swarm.id}">
    ${imageHtml}
    <div class="swarm-card__header">
        <h3 class="swarm-card__title">${SwarmCard._escape(productName)}</h3>
        ${retailValue}
    </div>
    <div class="swarm-card__meta">
        <span class="swarm-card__price">Nt ${swarm.comb_price} per Comb</span>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
    </div>
    <div class="progress-bar-wrap">
        <div class="progress-bar-label">
            <span>${swarm.combs_sold} Combs sold</span>
            <span>${combsRemaining} remaining</span>
        </div>
        <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${fillPct}%;"></div>
        </div>
    </div>
    <div class="swarm-card__meta">
        ${oddsHtml}
        ${timerHtml}
    </div>
    <div class="swarm-card__footer">
        <a href="/ca/swarms/${swarm.id}" class="btn-primary">Enter Swarm — Nt ${swarm.comb_price}</a>
    </div>
</article>`;
    }

    /**
     * Return the CSS badge class for a given swarm status.
     * @param {string} status
     * @returns {string}
     */
    static _badgeClass(status) {
        const map = {
            active:         'badge--active',
            filling_fast:   'badge--filling-fast',
            full:           'badge--full',
            draw_complete:  'badge--draw-complete',
            draft:          'badge--draft',
            expired:        'badge--expired',
            cancelled:      'badge--cancelled',
        };
        return 'badge ' + (map[status] || 'badge--active');
    }

    /**
     * Return the display label for a given swarm status.
     * @param {string} status
     * @returns {string}
     */
    static _badgeLabel(status) {
        const map = {
            active:         'Active',
            filling_fast:   'Filling Fast',
            full:           'Full',
            draw_complete:  'Draw Complete',
            draft:          'Draft',
            expired:        'Expired',
            cancelled:      'Cancelled',
        };
        return map[status] || 'Active';
    }

    /**
     * Escape a string for safe HTML attribute / text insertion.
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
}

App.Components.SwarmCard = SwarmCard;
