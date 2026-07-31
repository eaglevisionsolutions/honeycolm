<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\SettingsService;
use App\Middleware\AdminAuthMiddleware;

class SettingsController extends BaseController
{
    public function __construct(
        private SettingsService $settingsService = new SettingsService()
    ) {}

    /**
     * GET /api/v1/admin/settings
     */
    public function show(): never
    {
        try {
            $this->success($this->settingsService->getSettings());
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PATCH /api/v1/admin/settings
     */
    public function update(): never
    {
        try {
            $result = $this->settingsService->updateSettings($this->body());
            $this->success($result, 'Settings updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/admin/settings/test-random-org
     */
    public function testRandomOrg(): never
    {
        try {
            $result = $this->settingsService->testRandomOrgConnection();
            $this->success($result, 'Connected.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/admin/staff
     */
    public function listStaff(): never
    {
        try {
            $this->success($this->settingsService->listStaff());
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/admin/staff
     * Body: { name, email, password, role }
     */
    public function createStaff(): never
    {
        try {
            $staff = AdminAuthMiddleware::$staff;
            $role  = (string) ($staff->role ?? 'staff');

            $created = $this->settingsService->createStaff($this->body(), $role);
            $this->created($created, 'Staff member created.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PATCH /api/v1/admin/staff/{id}
     * Body: { is_active?: 0|1, role?: string }
     */
    public function updateStaff(string $id): never
    {
        try {
            $staff = AdminAuthMiddleware::$staff;
            $role  = (string) ($staff->role ?? 'staff');

            $updated = $this->settingsService->updateStaff((int) $id, $this->body(), $role);
            $this->success($updated, 'Staff member updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
