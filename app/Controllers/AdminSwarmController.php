<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\SwarmService;
use App\Middleware\AdminAuthMiddleware;

class AdminSwarmController extends BaseController
{
    public function __construct(
        private SwarmService $swarmService = new SwarmService()
    ) {}

    /**
     * GET /api/v1/admin/swarms
     * Query params: status, region, page, per_page, search.
     */
    public function index(): never
    {
        try {
            $filters = [
                'status' => (string) $this->param('status', ''),
                'region' => (string) $this->param('region', ''),
                'search' => (string) $this->param('search', ''),
            ];

            $result = $this->swarmService->getAdminSwarms(
                $filters,
                (int) $this->param('page', 1),
                (int) $this->param('per_page', 20)
            );

            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/admin/swarms/{id}
     * Returns full swarm detail including Comb holders.
     */
    public function show(string $id): never
    {
        try {
            $swarm = $this->swarmService->getAdminSwarmDetail((int) $id);

            $this->success($swarm);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/admin/swarms
     * Creates a new Swarm with status='draft'.
     */
    public function store(): never
    {
        try {
            $staff      = AdminAuthMiddleware::$staff;
            $adminId    = (int) ($staff->sub ?? 0);
            $data       = $this->body();
            $swarm      = $this->swarmService->create($data, $adminId);

            $this->created($swarm, 'Swarm created.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PUT /api/v1/admin/swarms/{id}
     * Updates a draft Swarm's fields.
     */
    public function update(string $id): never
    {
        try {
            $swarm = $this->swarmService->update((int) $id, $this->body());

            $this->success($swarm, 'Swarm updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/admin/swarms/{id}/publish
     * Transitions status from 'draft' to 'active'.
     */
    public function publish(string $id): never
    {
        try {
            $swarm = $this->swarmService->publish((int) $id);

            $this->success($swarm, 'Swarm published.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/admin/swarms/{id}/cancel
     * Cancels a Swarm. Refunds are handled by Task 10.
     */
    public function cancel(string $id): never
    {
        try {
            $swarm = $this->swarmService->cancel((int) $id);

            $this->success($swarm, 'Swarm cancelled.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
