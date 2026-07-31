<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\MemberService;

class MemberController extends BaseController
{
    public function __construct(
        private MemberService $memberService = new MemberService()
    ) {}

    /**
     * GET /api/v1/admin/members
     * Query params: status, search, page, per_page.
     */
    public function index(): never
    {
        try {
            $filters = [
                'status' => (string) $this->param('status', ''),
                'search' => (string) $this->param('search', ''),
            ];

            $result = $this->memberService->listMembers(
                $filters,
                (int) $this->param('page', 1),
                (int) $this->param('per_page', 25)
            );

            $this->success($result);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * GET /api/v1/admin/members/{id}
     */
    public function show(string $id): never
    {
        try {
            $member = $this->memberService->getMemberDetail((int) $id);
            $this->success($member);
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * PATCH /api/v1/admin/members/{id}
     * Body: { "status": "active"|"deactivated" }
     */
    public function update(string $id): never
    {
        try {
            $body   = $this->body();
            $status = (string) ($body['status'] ?? '');

            $member = $this->memberService->updateStatus((int) $id, $status);
            $this->success($member, 'Member updated.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    /**
     * POST /api/v1/admin/members/{id}/wallet/adjust
     * Body: { "amount": number, "bucket": "deposit"|"bonus", "notes": string }
     */
    public function adjustWallet(string $id): never
    {
        try {
            $body   = $this->body();
            $amount = isset($body['amount']) ? (float) $body['amount'] : 0.0;
            $bucket = (string) ($body['bucket'] ?? 'bonus');
            $notes  = (string) ($body['notes'] ?? '');

            $member = $this->memberService->adjustWallet((int) $id, $amount, $bucket, $notes);
            $this->success($member, 'Adjustment applied.');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }
}
