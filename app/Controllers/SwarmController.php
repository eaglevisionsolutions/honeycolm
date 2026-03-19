<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\SwarmService;
use App\Middleware\AuthMiddleware;

class SwarmController extends BaseController
{
    public function __construct(
        private SwarmService $swarmService = new SwarmService()
    ) {}

    /**
     * GET /api/v1/swarms
     * Public. Query params: region (required), category, sort.
     */
    public function index(): never
    {
        try {
            $region = (string) $this->param('region', '');

            if ($region === '') {
                $this->error('The region parameter is required.', 422);
            }

            $filters = [
                'category' => (string) $this->param('category', ''),
                'sort'     => (string) $this->param('sort', 'newest'),
            ];

            $swarms = $this->swarmService->getActiveSwarms($region, $filters);

            $this->success($swarms);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/swarms/{id}
     * Public. Returns swarm detail with product and images.
     * If authenticated, includes member's combs and odds.
     */
    public function show(string $id): never
    {
        try {
            // Attempt optional auth — don't enforce it
            $userId = null;
            if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
                try {
                    $payload = (new AuthMiddleware())->requireAuth();
                    $userId  = (int) $payload->sub;
                } catch (\Throwable) {
                    // Unauthenticated — serve public view
                }
            }

            $swarm = $this->swarmService->getSwarmDetail((int) $id, $userId);

            $this->success($swarm);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/swarms/{id}/combs
     * Protected (AuthMiddleware). Body: {quantity: int}.
     */
    public function purchaseCombs(string $id): never
    {
        try {
            $payload  = AuthMiddleware::$payload;
            $userId   = (int) $payload->sub;
            $body     = $this->body();
            $quantity = isset($body['quantity']) ? (int) $body['quantity'] : 0;

            if ($quantity < 1) {
                $this->error('Quantity must be at least 1.', 422, ['quantity' => 'Quantity must be at least 1.']);
            }

            $result = $this->swarmService->purchaseCombs($userId, (int) $id, $quantity);

            $this->success($result, 'Combs purchased successfully.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/swarms/{id}/odds
     * Public. Returns live odds and combs_remaining.
     * If authenticated, includes member's personal odds.
     */
    public function odds(string $id): never
    {
        try {
            $userId = null;
            if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
                try {
                    $payload = (new AuthMiddleware())->requireAuth();
                    $userId  = (int) $payload->sub;
                } catch (\Throwable) {
                    // Unauthenticated
                }
            }

            $odds = $this->swarmService->getOdds((int) $id, $userId);

            $this->success($odds);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
