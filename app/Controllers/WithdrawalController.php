<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\WithdrawalService;
use App\Middleware\AdminAuthMiddleware;

class WithdrawalController extends BaseController
{
    public function __construct(
        private WithdrawalService $withdrawalService = new WithdrawalService()
    ) {}

    /**
     * GET /api/v1/admin/withdrawals
     * Query params: status (pending|approved|rejected|paid).
     */
    public function index(): never
    {
        try {
            $status = (string) $this->param('status', 'pending');
            $result = $this->withdrawalService->listByStatus($status);
            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PATCH /api/v1/admin/withdrawals/{id}
     * Body: { "status": "approved"|"rejected"|"paid", "notes"?: string }
     */
    public function update(string $id): never
    {
        try {
            $staff   = AdminAuthMiddleware::$staff;
            $adminId = (int) ($staff->sub ?? 0);

            $body   = $this->body();
            $status = (string) ($body['status'] ?? '');
            $notes  = isset($body['notes']) ? (string) $body['notes'] : null;

            $result = $this->withdrawalService->updateStatus((int) $id, $status, $notes, $adminId);
            $this->success($result, 'Withdrawal updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
