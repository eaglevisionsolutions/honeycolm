<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\WalletService;
use App\Middleware\AuthMiddleware;

class WalletController extends BaseController
{
    private WalletService $walletService;

    public function __construct()
    {
        $this->walletService = new WalletService();
    }

    /** GET /api/v1/wallet */
    public function balance(): never
    {
        try {
            $userId = (int) AuthMiddleware::$payload->sub;
            $result = $this->walletService->getBalance($userId);
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /** GET /api/v1/wallet/transactions */
    public function transactions(): never
    {
        try {
            $userId  = (int) AuthMiddleware::$payload->sub;
            $page    = (int) $this->param('page', 1);
            $perPage = (int) $this->param('per_page', 20);
            $result  = $this->walletService->getTransactionHistory($userId, $page, $perPage);
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
