<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\DashboardService;

class DashboardController extends BaseController
{
    public function __construct(
        private DashboardService $dashboardService = new DashboardService()
    ) {}

    /**
     * GET /api/v1/admin/dashboard
     * Returns stat cards, the active Swarms table, and a recent-activity feed.
     */
    public function index(): never
    {
        try {
            $data = $this->dashboardService->getDashboard();
            $this->success($data);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
