/**
 * App.Controllers.NectarWalletController
 * Nectar Wallet and Top-Up page.
 * Auth-gated. Displays deposit/bonus balances, top-up tier selector,
 * Stripe Checkout launch, transaction history, and withdrawal request form.
 */

'use strict';

App.Controllers.NectarWalletController = class NectarWalletController extends App.Controllers.BaseController {

    constructor() {
        super();
        this._wallet       = null;
        this._selectedTier = null;
        this._txPage       = 1;

        this._TIERS = [
            { amount: 10,  deposit: 10,  bonus: 0  },
            { amount: 25,  deposit: 25,  bonus: 0  },
            { amount: 50,  deposit: 50,  bonus: 5  },
            { amount: 100, deposit: 100, bonus: 15 },
            { amount: 200, deposit: 200, bonus: 40 },
        ];

        this._TYPE_LABELS = {
            topup:               'Top up',
            spend:               'Swarm entry',
            refund:              'Refund',
            withdrawal_request:  'Withdrawal request',
        };
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    init() {
        // Auth guard
        if (!this._auth.isLoggedIn()) {
            window.location.href = '/ca/login';
            return;
        }

        App.Utils.SEO.setPageMeta({
            title:  'My Wallet — Honeycolm',
            robots: 'noindex, nofollow',
        });

        // Detect Stripe return params and show feedback
        this._handleStripeReturn();

        this.renderShell();

        this.loadWallet();
    }

    // -------------------------
    // Data loading
    // -------------------------

    async loadWallet() {
        try {
            const response    = await this._api.get('/wallet');
            this._wallet      = response.data;
            this.renderBalances();
            this.renderWithdrawalForm();
        } catch (err) {
            this.showError('Unable to load your wallet. Please refresh the page.');
        }
    }

    async loadTransactions(page) {
        this._txPage = page;

        $('#tx-list').html('<div class="page-loading"><span class="spinner"></span> Loading transactions&hellip;</div>');
        $('#tx-pagination').empty();

        try {
            const response = await this._api.get('/wallet/transactions?page=' + page + '&per_page=20');
            const txData   = response.data;

            this._renderTransactionRows(txData.transactions || txData.data || []);
            this._renderTxPagination(txData);
        } catch (err) {
            $('#tx-list').html('<p class="wallet-empty-state">Unable to load transaction history.</p>');
        }
    }

    // -------------------------
    // Rendering
    // -------------------------

    renderShell() {
        $('#app-root').html(`
            <div class="wallet-layout">
                <div class="wallet-main">
                    <h1 class="wallet-page-title">Your Nectar wallet</h1>
                    <div id="wallet-balances"></div>
                    <div id="topup-section"></div>
                    <div id="withdrawal-section"></div>
                </div>
                <div class="wallet-history">
                    <h2 class="wallet-history-title">Transaction history</h2>
                    <div id="tx-list"></div>
                    <div id="tx-pagination"></div>
                </div>
            </div>
        `);

        this.renderTopUpTiers();
        this.loadTransactions(1);
    }

    renderBalances() {
        if (!this._wallet) return;

        const deposit = this._wallet.deposit_balance || 0;
        const bonus   = this._wallet.bonus_balance   || 0;
        const total   = deposit + bonus;

        $('#wallet-balances').html(`
            <div class="balance-cards">
                <div class="balance-card balance-card--deposit">
                    <p class="balance-label">Deposit balance</p>
                    <p class="balance-amount">Nt ${deposit.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p class="balance-sub">Withdrawable</p>
                </div>
                <div class="balance-card balance-card--bonus">
                    <p class="balance-label">Bonus balance</p>
                    <p class="balance-amount">Nt ${bonus.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p class="balance-sub">Non-withdrawable &mdash; Swarm entries only</p>
                </div>
            </div>
            <p class="balance-total">Total: Nt ${total.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        `);
    }

    renderTopUpTiers() {
        const tierCardsHtml = this._TIERS.map(t => {
            const bonusHtml = t.bonus > 0
                ? `<span class="tier-bonus">+Nt ${t.bonus} bonus</span>`
                : '';
            return `
                <div class="tier-card" data-amount="${t.amount}">
                    <p class="tier-price">$${t.amount} CAD</p>
                    <p class="tier-deposit">Nt ${t.deposit}</p>
                    ${bonusHtml}
                    <p class="tier-total">Total: Nt ${t.deposit + t.bonus}</p>
                </div>`;
        }).join('');

        $('#topup-section').html(`
            <section class="topup-section">
                <h2 class="topup-title">Top up your wallet</h2>
                <div class="tier-cards">${tierCardsHtml}</div>
                <button id="btn-topup" class="btn-primary" disabled>Top up with Stripe</button>
            </section>
        `);

        // Bind tier selection
        $('#topup-section').on('click', '.tier-card', (e) => {
            const card   = $(e.currentTarget);
            const amount = parseInt(card.data('amount'), 10);

            $('.tier-card').removeClass('active');
            card.addClass('active');

            this._selectedTier = this._TIERS.find(t => t.amount === amount) || null;
            $('#btn-topup').prop('disabled', !this._selectedTier);
        });

        // Bind top-up button
        $('#topup-section').on('click', '#btn-topup', () => {
            this.onTopUp();
        });
    }

    renderWithdrawalForm() {
        if (!this._wallet) return;

        const deposit = this._wallet.deposit_balance || 0;

        if (deposit < 10) {
            $('#withdrawal-section').html(`
                <section class="withdrawal-section">
                    <h2 class="withdrawal-title">Request a withdrawal</h2>
                    <p class="withdrawal-unavailable">You need at least Nt 10 in your Deposit Balance to request a withdrawal.</p>
                </section>
            `);
            return;
        }

        const maxFormatted = deposit.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        $('#withdrawal-section').html(`
            <section class="withdrawal-section">
                <h2 class="withdrawal-title">Request a withdrawal</h2>
                <form id="withdrawal-form" novalidate>
                    <div class="form-group">
                        <label for="withdrawal-amount">Withdrawal amount (Nt)</label>
                        <input type="number"
                               id="withdrawal-amount"
                               name="withdrawal-amount"
                               min="10"
                               max="${deposit}"
                               step="0.01"
                               placeholder="e.g. 25.00"
                               autocomplete="off">
                        <p class="field-hint">Min Nt 10 &middot; Max Nt ${maxFormatted} &middot; Processed in 3&ndash;5 business days via Interac e-Transfer</p>
                        <span class="field-error" id="withdrawal-error" style="display:none;"></span>
                    </div>
                    <button type="submit" class="btn-primary">Request withdrawal</button>
                </form>
            </section>
        `);

        // Bind withdrawal form submit
        $('#withdrawal-section').on('submit', '#withdrawal-form', (e) => {
            e.preventDefault();
            this._onWithdrawalSubmit();
        });
    }

    // -------------------------
    // Actions
    // -------------------------

    async onTopUp() {
        if (!this._selectedTier) return;

        const btn = $('#btn-topup');
        this.setLoading('#btn-topup', true);

        try {
            const response = await this._api.mutate('POST', '/payments/topup/create-session', {
                amount: this._selectedTier.amount,
            });

            if (response.queued) {
                this.showInfo('You are offline. The top-up will be processed when you reconnect.');
                return;
            }

            if (response.data && response.data.url) {
                window.location.href = response.data.url;
            } else {
                this.showError('Unable to start checkout. Please try again.');
            }
        } catch (err) {
            this.showError(err.message || 'Unable to start checkout. Please try again.');
        } finally {
            this.setLoading('#btn-topup', false);
            btn.text('Top up with Stripe');
        }
    }

    async _onWithdrawalSubmit() {
        const input   = $('#withdrawal-amount');
        const errorEl = $('#withdrawal-error');
        const amount  = parseFloat(input.val());
        const deposit = this._wallet ? (this._wallet.deposit_balance || 0) : 0;

        // Clear previous error
        errorEl.hide().text('');
        input.removeClass('is-invalid');

        // Client-side validation
        if (isNaN(amount) || amount < 10) {
            errorEl.text('Minimum withdrawal amount is Nt 10.').show();
            input.addClass('is-invalid');
            return;
        }

        if (amount > deposit) {
            errorEl.text('Amount exceeds your Deposit Balance of Nt ' + deposit.toFixed(2) + '.').show();
            input.addClass('is-invalid');
            return;
        }

        const submitBtn = $('#withdrawal-form button[type="submit"]');
        submitBtn.prop('disabled', true).text('Submitting...');

        try {
            const response = await this._api.mutate('POST', '/withdrawals', { amount });

            if (response.queued) {
                this.showInfo('You are offline. Your withdrawal request will be submitted when you reconnect.');
            } else {
                this.showSuccess('Withdrawal request submitted &mdash; processed within 3&ndash;5 business days.');
                input.val('');
            }
        } catch (err) {
            this.showError(err.message || 'Unable to submit withdrawal request. Please try again.');
        } finally {
            submitBtn.prop('disabled', false).text('Request withdrawal');
        }
    }

    // -------------------------
    // Transaction history rendering
    // -------------------------

    _renderTransactionRows(transactions) {
        if (!transactions || transactions.length === 0) {
            $('#tx-list').html('<p class="wallet-empty-state">No transactions yet. Top up your wallet to get started.</p>');
            return;
        }

        const rowsHtml = transactions.map(tx => {
            const date       = this._formatDate(tx.created_at || tx.date);
            const typeLabel  = this._TYPE_LABELS[tx.type] || tx.type || 'Transaction';
            const isPositive = tx.amount > 0;
            const amountStr  = (isPositive ? '+' : '') + 'Nt ' + Math.abs(tx.amount).toFixed(2);
            const amountCls  = isPositive ? 'tx-amount--positive' : 'tx-amount--negative';
            const bucket     = tx.bucket === 'bonus' ? 'Bonus' : 'Deposit';
            const balAfter   = tx.balance_after !== undefined ? 'Nt ' + parseFloat(tx.balance_after).toFixed(2) : '—';

            return `
                <div class="tx-row">
                    <span class="tx-date">${date}</span>
                    <span class="tx-type">${typeLabel}</span>
                    <span class="tx-amount ${amountCls}">${amountStr}</span>
                    <span class="tx-bucket">${bucket}</span>
                    <span class="tx-balance-after">${balAfter}</span>
                </div>`;
        }).join('');

        // Column headers
        const headerHtml = `
            <div class="tx-row tx-row--header">
                <span class="tx-date">Date</span>
                <span class="tx-type">Type</span>
                <span class="tx-amount">Amount</span>
                <span class="tx-bucket">Bucket</span>
                <span class="tx-balance-after">Balance after</span>
            </div>`;

        $('#tx-list').html(headerHtml + rowsHtml);
    }

    _renderTxPagination(txData) {
        const currentPage = txData.current_page || this._txPage;
        const lastPage    = txData.last_page || txData.total_pages || 1;

        if (currentPage >= lastPage) {
            $('#tx-pagination').empty();
            return;
        }

        const nextPage = currentPage + 1;
        $('#tx-pagination').html(`
            <button class="btn-ghost btn-sm wallet-load-more" id="btn-load-more-tx">
                Load more transactions
            </button>
        `);

        $('#tx-pagination').on('click', '#btn-load-more-tx', () => {
            this.loadTransactions(nextPage);
        });
    }

    // -------------------------
    // Stripe return handling
    // -------------------------

    _handleStripeReturn() {
        const params  = new URLSearchParams(window.location.search);
        const topup   = params.get('topup');

        if (topup === 'success') {
            this.showSuccess('Top-up successful! Your Nectar balance has been updated.');
            // Clean the query string without reloading
            const cleanUrl = window.location.pathname;
            history.replaceState({}, '', cleanUrl);
        } else if (topup === 'cancelled') {
            this.showInfo('Top-up cancelled. Your wallet was not charged.');
            const cleanUrl = window.location.pathname;
            history.replaceState({}, '', cleanUrl);
        }
    }

    // -------------------------
    // Utilities
    // -------------------------

    _formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
    }
};
