<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\EmailNotificationModel;

class NotificationController extends BaseController
{
    public function __construct(
        private EmailNotificationModel $model = new EmailNotificationModel()
    ) {}

    /**
     * GET /api/v1/admin/notifications
     * Returns paginated notification queue with optional filters.
     */
    public function index(): never
    {
        try {
            $filters = [
                'status' => $this->param('status'),
                'type'   => $this->param('type'),
            ];

            $page    = max(1, (int) $this->param('page', '1'));
            $perPage = max(1, min(100, (int) $this->param('per_page', '20')));

            $result = $this->model->findPaginated($filters, $page, $perPage);

            $this->success([
                'notifications' => $result['notifications'],
                'total'         => $result['total'],
                'page'          => $page,
                'per_page'      => $perPage,
            ]);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
