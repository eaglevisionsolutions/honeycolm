/**
 * App.Controllers.FaqController
 * Renders the FAQ page with accordion-style expand/collapse behaviour.
 *
 * - Hardcoded FAQ data using exact brand copy
 * - No API calls — fully static content
 * - Accordion: click question expands answer, click again collapses
 * - Only one answer open at a time
 * - aria-expanded attribute toggles for accessibility
 *
 * Brand vocabulary used throughout: Swarm, Comb, The Dip, Nectar.
 * Prohibited words never appear: no lottery, raffle, ticket, gambling, bet.
 */

'use strict';

window.App          = window.App          || {};
App.Controllers     = App.Controllers     || {};

App.Controllers.FaqController = class FaqController extends App.Controllers.BaseController {

    constructor() {
        super();
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    /**
     * Entry point — renders the FAQ accordion page into #app-root.
     * @returns {void}
     */
    init() {
        App.Utils.SEO.setPageMeta({
            title:       'FAQ — Honeycolm',
            description: 'Answers to your Honeycolm questions — how Swarms work, what Nectar is, how draws are verified.',
            canonical:   'https://honeycolm.ca/ca/faq',
            schema:      App.Utils.SEO.faqSchema(this._getFaqData()),
        });

        this._render();
        this._bindEvents();
    }

    // -------------------------
    // Render
    // -------------------------

    /**
     * Build and inject the complete FAQ page.
     * @returns {void}
     */
    _render() {
        const faqItems = this._getFaqData();

        const itemsHtml = faqItems.map((item, index) => `
    <div class="faq-item">
        <button class="faq-question" aria-expanded="false" data-faq-index="${index}">
            ${FaqController._escape(item.question)}
        </button>
        <div class="faq-answer" hidden>
            <p>${FaqController._escape(item.answer)}</p>
        </div>
    </div>`).join('');

        const html = `
<section class="page-hero page-hero--light">
    <h1>Frequently asked questions</h1>
    <p>Everything you need to know about Honeycolm.</p>
</section>
<section class="faq-section">
    ${itemsHtml}
</section>`;

        $('#app-root').html(html);
    }

    // -------------------------
    // FAQ Data
    // -------------------------

    /**
     * Returns the hardcoded FAQ data with exact brand copy.
     * These answers must not be paraphrased.
     * @returns {{ question: string, answer: string }[]}
     */
    _getFaqData() {
        return [
            {
                question: 'Is Honeycolm a lottery?',
                answer: 'No. Honeycolm is a crowd-purchase marketplace. Members collectively fund the full retail price of a product through a Swarm. When the pool fills, Random.org automatically selects one member to receive the item. This is a legal and common model across Canada and internationally.',
            },
            {
                question: 'What are Combs?',
                answer: 'A Comb is your entry into a Swarm. Each Comb costs a fixed amount of Nectar. The more Combs you hold in a Swarm, the higher your odds of winning \u2014 and your live odds are always displayed on the Swarm page.',
            },
            {
                question: 'What is Nectar?',
                answer: 'Nectar is Honeycolm\u2019s virtual currency. 1 Nectar always equals $1 CAD. When you top up your wallet with $50, you receive Nt 50 (plus any applicable bonus). Nectar is used exclusively to enter Swarms.',
            },
            {
                question: 'What happens if a Swarm doesn\u2019t fill?',
                answer: 'If a Swarm doesn\u2019t fill before its deadline, all Nectar spent on Combs is automatically refunded to your wallet. No action needed \u2014 it\u2019s handled instantly.',
            },
            {
                question: 'Can I withdraw my Nectar?',
                answer: 'You can withdraw your Deposit Balance (Nectar loaded from real money) at any time. The minimum withdrawal is Nt 10. Bonus Nectar earned through promotions cannot be withdrawn \u2014 it can only be used to enter Swarms.',
            },
            {
                question: 'How is the winner chosen?',
                answer: 'When the last Comb in a Swarm is purchased, the Random.org API is triggered automatically. No human intervention. Ever. The verified result is published publicly with a Random.org verification link so anyone can confirm the draw was fair.',
            },
            {
                question: 'How do I know the draws are fair?',
                answer: 'Every Swarm draw is handled by Random.org, a trusted third-party verified randomness service. The draw result \u2014 including the Random.org request ID and verification URL \u2014 is permanently published on each Swarm\u2019s result page.',
            },
        ];
    }

    // -------------------------
    // Event handlers
    // -------------------------

    /**
     * Bind click events for accordion behaviour.
     * Click a question to expand its answer. Click again to collapse.
     * Only one answer open at a time.
     * @returns {void}
     */
    _bindEvents() {
        $(document).on('click', '.faq-question', function () {
            const $button  = $(this);
            const $item    = $button.closest('.faq-item');
            const $answer  = $item.find('.faq-answer');
            const isOpen   = $button.attr('aria-expanded') === 'true';

            // Close all other open items
            $('.faq-question[aria-expanded="true"]').not($button).each(function () {
                $(this).attr('aria-expanded', 'false');
                $(this).closest('.faq-item').find('.faq-answer').prop('hidden', true);
            });

            // Toggle current item
            if (isOpen) {
                $button.attr('aria-expanded', 'false');
                $answer.prop('hidden', true);
            } else {
                $button.attr('aria-expanded', 'true');
                $answer.prop('hidden', false);
            }
        });
    }

    // -------------------------
    // Static utilities
    // -------------------------

    /**
     * Escape a value for safe HTML text insertion.
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
};
