<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Services\StripeService;

class PaymentController extends BaseController
{
    private StripeService $stripeService;

    public function __construct()
    {
        $this->stripeService = new StripeService();
    }

    /**
     * POST /api/v1/payment/checkout  [Protected]
     *
     * Body: { "tier": 10|25|50|100|200 }
     * Returns: { "checkout_url": "https://checkout.stripe.com/..." }
     */
    public function checkout(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $body   = $this->body();
            $tier   = isset($body['tier']) ? (int) $body['tier'] : 0;

            $result = $this->stripeService->createCheckoutSession($userId, $tier);
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/payment/webhook  [Public — no auth, Stripe signature verified]
     *
     * Handles checkout.session.completed — credits wallet.
     */
    public function webhook(): never
    {
        try {
            $payload   = file_get_contents('php://input') ?: '';
            $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

            $this->stripeService->handleWebhook($payload, $sigHeader);
            $this->success([], 'Webhook received.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/payment/withdrawal  [Protected]
     *
     * Body: { "amount": float }
     * Returns: { "withdrawal_id": N }
     */
    public function requestWithdrawal(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $body   = $this->body();
            $amount = isset($body['amount']) ? (float) $body['amount'] : 0.0;

            $result = $this->stripeService->requestWithdrawal($userId, $amount);
            $this->success($result, 'Withdrawal request submitted.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
