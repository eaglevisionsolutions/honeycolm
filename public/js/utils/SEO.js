/**
 * App.Utils.SEO
 * Manages dynamic page metadata: title, meta description, canonical,
 * robots, and JSON-LD structured data.
 *
 * Usage:
 *   App.Utils.SEO.setPageMeta({ title, description, canonical, robots, schema });
 *   App.Utils.SEO.organizationSchema();
 *   App.Utils.SEO.faqSchema([{ question, answer }]);
 */

'use strict';

window.App  = window.App  || {};
App.Utils   = App.Utils   || {};

App.Utils.SEO = class SEO {

    /**
     * Update page-level meta tags dynamically.
     *
     * @param {object}  options
     * @param {string}  [options.title]       - Sets document.title
     * @param {string}  [options.description] - Updates <meta name="description">
     * @param {string}  [options.canonical]   - Updates <link rel="canonical">
     * @param {string}  [options.robots]      - Updates <meta name="robots"> (default: index, follow)
     * @param {object}  [options.schema]      - JSON-LD object inserted as a dynamic <script>
     */
    static setPageMeta({ title, description, canonical, robots, schema } = {}) {

        // ── Title ────────────────────────────────────────────────────────────
        if (title) {
            document.title = title;
        }

        // ── Meta description ──────────────────────────────────────────────────
        if (description) {
            let descTag = document.querySelector('meta[name="description"]');
            if (!descTag) {
                descTag = document.createElement('meta');
                descTag.setAttribute('name', 'description');
                document.head.appendChild(descTag);
            }
            descTag.setAttribute('content', description);
        }

        // ── Canonical ─────────────────────────────────────────────────────────
        if (canonical) {
            let canonTag = document.querySelector('link[rel="canonical"]');
            if (!canonTag) {
                canonTag = document.createElement('link');
                canonTag.setAttribute('rel', 'canonical');
                document.head.appendChild(canonTag);
            }
            canonTag.setAttribute('href', canonical);
        }

        // ── Robots ────────────────────────────────────────────────────────────
        if (robots) {
            let robotsTag = document.querySelector('meta[name="robots"]');
            if (!robotsTag) {
                robotsTag = document.createElement('meta');
                robotsTag.setAttribute('name', 'robots');
                document.head.appendChild(robotsTag);
            }
            robotsTag.setAttribute('content', robots);
        }

        // ── JSON-LD schema ────────────────────────────────────────────────────
        if (schema) {
            // Remove any previously injected dynamic schema
            const existing = document.querySelector('script[type="application/ld+json"][data-dynamic]');
            if (existing) {
                existing.parentNode.removeChild(existing);
            }

            const scriptTag = document.createElement('script');
            scriptTag.setAttribute('type', 'application/ld+json');
            scriptTag.setAttribute('data-dynamic', 'true');
            scriptTag.textContent = JSON.stringify(schema);
            document.head.appendChild(scriptTag);
        }
    }

    /**
     * Returns the Organization JSON-LD schema object for Honeycolm.
     * Use on the homepage and any page where brand identity should be reinforced.
     *
     * @returns {object}
     */
    static organizationSchema() {
        return {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            'name': 'Honeycolm',
            'url': 'https://honeycolm.ca',
            'logo': 'https://honeycolm.ca/public/images/og-image.png',
            'description': 'Honeycolm is Canada\'s crowd-purchase marketplace. Members pool together to buy premium products, and one randomly selected member receives the item.',
            'foundingLocation': {
                '@type': 'Place',
                'addressCountry': 'CA',
                'addressRegion': 'ON',
            },
            'contactPoint': {
                '@type': 'ContactPoint',
                'contactType': 'customer support',
                'availableLanguage': 'English',
            },
            'sameAs': [
                'https://honeycolm.ca',
                'https://honeycolm.com',
            ],
        };
    }

    /**
     * Returns a FAQPage JSON-LD schema object built from an array of Q&A pairs.
     *
     * @param {{ question: string, answer: string }[]} faqs
     * @returns {object}
     */
    static faqSchema(faqs) {
        if (!Array.isArray(faqs) || faqs.length === 0) {
            return null;
        }

        return {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            'mainEntity': faqs.map(function (item) {
                return {
                    '@type': 'Question',
                    'name': item.question,
                    'acceptedAnswer': {
                        '@type': 'Answer',
                        'text': item.answer,
                    },
                };
            }),
        };
    }
};
