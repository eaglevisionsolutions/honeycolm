<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\DrawService;

class DrawController extends BaseController
{
    public function __construct(
        private DrawService $drawService = new DrawService()
    ) {}

    /**
     * GET /api/v1/admin/draws
     * Returns all draws for admin listing.
     */
    public function adminIndex(): never
    {
        try {
            $draws = $this->drawService->getAdminDraws();
            $this->success($draws);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/admin/draws/{swarmId}
     * Returns draw detail for a specific swarm.
     */
    public function adminShow(string $swarmId): never
    {
        try {
            $draw = $this->drawService->getAdminDrawDetail((int) $swarmId);
            $this->success($draw);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PUT /api/v1/admin/draws/{swarmId}/shipped
     * Marks the draw's swarm as shipped.
     */
    public function markShipped(string $swarmId): never
    {
        try {
            $draw = $this->drawService->markShipped((int) $swarmId);
            $this->success($draw, 'Draw marked as shipped.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/swarms/{id}/result
     * Public — returns draw result for a swarm.
     */
    public function publicResult(string $id): never
    {
        try {
            $draw = $this->drawService->getDrawResult((int) $id);
            $this->success($draw);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
