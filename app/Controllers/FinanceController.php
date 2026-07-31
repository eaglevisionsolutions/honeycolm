<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\FinanceService;

class FinanceController extends BaseController
{
    public function __construct(
        private FinanceService $financeService = new FinanceService()
    ) {}

    /**
     * GET /api/v1/admin/finance
     */
    public function index(): never
    {
        try {
            $data = $this->financeService->getFinanceOverview();
            $this->success($data);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
