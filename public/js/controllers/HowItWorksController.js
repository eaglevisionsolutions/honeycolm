/**
 * App.Controllers.HowItWorksController
 * Renders the How It Works static content page into #app-root.
 * No API calls required — fully static content.
 */

'use strict';

App.Controllers.HowItWorksController = class HowItWorksController extends App.Controllers.BaseController {

    init() {
        const html = `
            <section class="page-hero page-hero--light honeycomb-pattern">
                <h1>How it works</h1>
                <p>The hive pools together. One lucky bee takes home the honey.</p>
            </section>

            <section class="hiw-steps">
                <div class="hiw-steps__inner">
                    <h2 class="hiw-steps__heading">Six simple steps</h2>
                    <div class="hiw-steps__grid">

                        <div class="hiw-step">
                            <div class="hiw-step__number">1</div>
                            <h3 class="hiw-step__title">Browse active Swarms</h3>
                            <p class="hiw-step__body">Find a product you want. Every Swarm shows the item, the retail value, the Comb price, and your live odds — all before you commit a single Nectar.</p>
                        </div>

                        <div class="hiw-step">
                            <div class="hiw-step__number">2</div>
                            <h3 class="hiw-step__title">Buy Combs with your Nectar balance</h3>
                            <p class="hiw-step__body">Each Comb is one entry into the Swarm. Nt&nbsp;1 always equals $1&nbsp;CAD. Top up your Nectar wallet at any time and use it across any active Swarm.</p>
                        </div>

                        <div class="hiw-step">
                            <div class="hiw-step__number">3</div>
                            <h3 class="hiw-step__title">Your odds are always live</h3>
                            <p class="hiw-step__body">The more Combs you hold in a Swarm, the higher your odds of winning. Your live odds are displayed in real time on every Swarm page — no hidden numbers, ever.</p>
                        </div>

                        <div class="hiw-step">
                            <div class="hiw-step__number">4</div>
                            <h3 class="hiw-step__title">The pool fills</h3>
                            <p class="hiw-step__body">When every Comb in the Swarm has been purchased, the pool is full. The collective Nectar from all members covers the full retail cost of the item.</p>
                        </div>

                        <div class="hiw-step">
                            <div class="hiw-step__number">5</div>
                            <h3 class="hiw-step__title">The Dip selects one winner</h3>
                            <p class="hiw-step__body">The moment the last Comb is purchased, Random.org is triggered automatically. The Dip selects one winner from all Comb holders. No manual draws. No human intervention. Ever.</p>
                        </div>

                        <div class="hiw-step">
                            <div class="hiw-step__number">6</div>
                            <h3 class="hiw-step__title">The winner receives the item</h3>
                            <p class="hiw-step__body">The winner receives the physical item. If a Swarm doesn't fill by its deadline, every Nectar spent on Combs is refunded automatically to your wallet. No action needed from you.</p>
                        </div>

                    </div>
                </div>
            </section>

            <section class="hiw-trust">
                <div class="hiw-trust__inner">
                    <h2 class="hiw-trust__heading">Verified by Random.org</h2>
                    <p class="hiw-trust__body">Every draw on Honeycolm is handled by <a href="https://www.random.org" target="_blank" rel="noopener">Random.org</a> — a trusted third-party randomness service used by researchers, developers, and platforms worldwide. When The Dip runs, the Random.org request ID and a public verification URL are permanently published on the Swarm result page. Anyone can confirm the draw was fair.</p>
                    <p class="hiw-trust__body">Draw triggered automatically by Random.org when the last Comb is purchased. No manual draws. Ever.</p>
                </div>
            </section>

            <section class="hiw-cta">
                <div class="hiw-cta__inner">
                    <p class="hiw-cta__link-text">Have questions? <a href="/ca/faq">Read our FAQ &rarr;</a></p>
                </div>
            </section>
        `;

        $('#app-root').html(html);
    }
};
