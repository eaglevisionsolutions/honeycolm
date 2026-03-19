<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Env;
use App\Exceptions\AuthException;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Models\WalletModel;
use App\Models\WithdrawalRequestModel;
use App\Models\WalletTransactionModel;

class StripeService
{
    /**
     * Top-up tier definitions.
     * Keys are the CAD dollar amounts the user pays.
     * 'deposit' credits the deposit bucket; 'bonus' credits the bonus bucket.
     *
     * @var array<int, array{deposit: int, bonus: int}>
     */
    private const TIERS = [
        10  => ['deposit' => 10,  'bonus' => 0],
        25  => ['deposit' => 25,  'bonus' => 0],
        50  => ['deposit' => 50,  'bonus' => 5],
        100 => ['deposit' => 100, 'bonus' => 15],
        200 => ['deposit' => 200, 'bonus' => 40],
    ];

    private string $secretKey;
    private string $webhookSecret;
    private WalletService $walletService;
    private WalletModel $walletModel;
    private WithdrawalRequestModel $withdrawalRequestModel;
    private WalletTransactionModel $transactionModel;

    public function __construct(
        ?WalletService             $walletService             = null,
        ?WithdrawalRequestModel    $withdrawalRequestModel    = null,
        ?WalletTransactionModel    $transactionModel          = null,
        ?string                    $secretKey                 = null,
        ?string                    $webhookSecret             = null,
        ?WalletModel               $walletModel               = null,
    ) {
        $this->secretKey              = $secretKey     ?? Env::get('STRIPE_SECRET_KEY', '');
        $this->webhookSecret          = $webhookSecret ?? Env::get('STRIPE_WEBHOOK_SECRET', '');
        $this->walletService          = $walletService          ?? new WalletService();
        $this->walletModel            = $walletModel            ?? new WalletModel();
        $this->withdrawalRequestModel = $withdrawalRequestModel ?? new WithdrawalRequestModel();
        $this->transactionModel       = $transactionModel       ?? new WalletTransactionModel();

        \Stripe\Stripe::setApiKey($this->secretKey);
    }

    /**
     * Create a Stripe Checkout Session for a top-up tier.
     *
     * @return array{checkout_url: string}
     * @throws ValidationException if the tier is not one of the five valid tiers
     */
    public function createCheckoutSession(int $userId, int $tier): array
    {
        if (!array_key_exists($tier, self::TIERS)) {
            throw new ValidationException(
                ['tier' => 'Invalid top-up tier. Valid tiers are: ' . implode(', ', array_keys(self::TIERS)) . '.']
            );
        }

        $tierConfig = self::TIERS[$tier];
        $amountCents = $tier * 100; // e.g. $50 CAD = 5000 cents

        $session = \Stripe\Checkout\Session::create([
            'mode'        => 'payment',
            'line_items'  => [
                [
                    'quantity'   => 1,
                    'price_data' => [
                        'currency'     => 'cad',
                        'unit_amount'  => $amountCents,
                        'product_data' => [
                            'name' => 'Nectar Wallet Top-Up — $' . $tier . ' CAD',
                        ],
                    ],
                ],
            ],
            'success_url' => Env::get('STRIPE_SUCCESS_URL', ''),
            'cancel_url'  => Env::get('STRIPE_CANCEL_URL', ''),
            'metadata'    => [
                'user_id' => (string) $userId,
                'tier'    => (string) $tier,
                'deposit' => (string) $tierConfig['deposit'],
                'bonus'   => (string) $tierConfig['bonus'],
            ],
        ]);

        return ['checkout_url' => $session->url];
    }

    /**
     * Verify and handle an incoming Stripe webhook payload.
     * Handles checkout.session.completed by crediting the user's wallet.
     * Idempotent: duplicate payment_intent IDs are silently ignored.
     *
     * @throws AuthException if the webhook signature is invalid
     */
    public function handleWebhook(string $payload, string $sigHeader): void
    {
        try {
            $event = \Stripe\Webhook::constructEvent($payload, $sigHeader, $this->webhookSecret);
        } catch (\Stripe\Exception\SignatureVerificationException) {
            throw new AuthException('Invalid webhook signature.');
        }

        if ($event->type === 'checkout.session.completed') {
            $this->handleCheckoutSessionCompleted($event->data->object);
        }
    }

    /**
     * Submit a withdrawal request for a user.
     * Validates that amount >= 10 and does not exceed the deposit_balance.
     *
     * @return array{withdrawal_id: int}
     * @throws ValidationException
     */
    public function requestWithdrawal(int $userId, float $amount): array
    {
        if ($amount < 10) {
            throw new ValidationException(
                ['amount' => 'Minimum withdrawal amount is $10.00.']
            );
        }

        $balance = $this->walletService->getBalance($userId);

        if ($amount > $balance['deposit_balance']) {
            throw new ValidationException(
                ['amount' => 'Withdrawal amount exceeds your available deposit balance.']
            );
        }

        // Look up the wallet_id required by the withdrawal_requests table
        $wallets = $this->walletModel->findByUserId($userId);
        if (empty($wallets)) {
            throw new NotFoundException("No wallet found for user #{$userId}.");
        }
        $walletId = (int) $wallets[0]['id'];

        $id = $this->withdrawalRequestModel->insert([
            'user_id'   => $userId,
            'wallet_id' => $walletId,
            'amount'    => $amount,
            'status'    => 'pending',
        ]);

        return ['withdrawal_id' => $id];
    }

    /**
     * Process a checkout.session.completed event.
     * Reads metadata, checks idempotency, then credits the wallet.
     */
    private function handleCheckoutSessionCompleted(\Stripe\Checkout\Session $session): void
    {
        $metadata       = $session->metadata;
        $userId         = (int) ($metadata['user_id'] ?? 0);
        $deposit        = (float) ($metadata['deposit'] ?? 0);
        $bonus          = (float) ($metadata['bonus']   ?? 0);
        $paymentIntentId = (string) ($session->payment_intent ?? '');

        if ($userId === 0 || $paymentIntentId === '') {
            return;
        }

        // Idempotency check: if this payment_intent has already been credited, skip.
        if ($this->hasBeenCredited($paymentIntentId)) {
            return;
        }

        if ($deposit > 0) {
            $this->walletService->creditDeposit($userId, $deposit, $paymentIntentId);
        }

        if ($bonus > 0) {
            $this->walletService->creditBonus($userId, $bonus);
        }
    }

    /**
     * Check whether a Stripe payment_intent has already been credited to any wallet.
     */
    private function hasBeenCredited(string $stripePaymentId): bool
    {
        $row = $this->transactionModel->findByStripePaymentId($stripePaymentId);
        return $row !== false;
    }
}
