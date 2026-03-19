<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
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
     * Atomically deducts the amount from the deposit bucket via SELECT FOR UPDATE
     * to prevent multiple concurrent withdrawal requests from draining funds.
     * Records a wallet_transaction row for audit trail.
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

        // Look up the wallet_id required by the withdrawal_requests table
        $wallets = $this->walletModel->findByUserId($userId);
        if (empty($wallets)) {
            throw new NotFoundException("No wallet found for user #{$userId}.");
        }
        $walletId = (int) $wallets[0]['id'];

        // Atomically verify deposit balance and deduct using SELECT FOR UPDATE.
        // This prevents race conditions where multiple withdrawal requests could
        // each pass a balance check before any deduction occurs.
        $newBalance = $this->walletModel->deductDepositWithLock($walletId, $amount);

        $id = $this->withdrawalRequestModel->insert([
            'user_id'   => $userId,
            'wallet_id' => $walletId,
            'amount'    => $amount,
            'status'    => 'pending',
        ]);

        // Record audit trail in wallet_transactions
        $this->transactionModel->record([
            'wallet_id'      => $walletId,
            'type'           => 'withdrawal_request',
            'bucket'         => 'deposit',
            'amount'         => $amount,
            'balance_after'  => $newBalance,
            'reference_type' => 'withdrawal',
            'reference_id'   => $id,
        ]);

        return ['withdrawal_id' => $id];
    }

    /**
     * Process a checkout.session.completed event.
     * Reads metadata, checks idempotency, then credits the wallet.
     *
     * Idempotency is enforced at two levels:
     *  1. Application-level SELECT check (fast-path for obvious duplicates)
     *  2. Database-level UNIQUE index on stripe_payment_id (catches race conditions
     *     where two concurrent webhook deliveries both pass the SELECT check)
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

        // Idempotency check (fast path): if this payment_intent has already been credited, skip.
        if ($this->hasBeenCredited($paymentIntentId)) {
            return;
        }

        // Credit the wallet inside a single DB transaction so that deposit + bonus
        // either both succeed or both roll back. This prevents a partial-credit state
        // where the deposit row (carrying stripe_payment_id) is committed but the
        // bonus credit fails — which would cause the idempotency check to skip the
        // bonus on webhook retry (H-1 fix).
        //
        // If a concurrent webhook delivery already inserted a row with this
        // stripe_payment_id, the UNIQUE index will trigger a PDOException which
        // we catch and silently ignore (the funds were already credited).
        $db = Database::connection();
        $db->beginTransaction();

        try {
            if ($deposit > 0) {
                $this->walletService->creditDeposit($userId, $deposit, $paymentIntentId);
            }

            if ($bonus > 0) {
                $this->walletService->creditBonus($userId, $bonus);
            }

            $db->commit();
        } catch (\PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            // Error code 23000 = integrity constraint violation (duplicate key)
            if ($e->getCode() === '23000' && str_contains($e->getMessage(), 'uq_stripe_payment_id')) {
                // Duplicate webhook delivery — funds already credited. Safe to ignore.
                return;
            }
            throw $e;
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
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
