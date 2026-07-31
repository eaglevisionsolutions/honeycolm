<?php

declare(strict_types=1);

namespace App\Models;

class WithdrawalRequestModel extends BaseModel
{
    protected string $table      = 'withdrawal_requests';
    protected string $primaryKey = 'id';

    /**
     * Find all pending withdrawal requests for a given user.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findPendingByUserId(int $userId): array
    {
        return $this->query(
            "SELECT * FROM `withdrawal_requests` WHERE `user_id` = ? AND `status` = 'pending'",
            [$userId]
        );
    }

    /**
     * Returns withdrawal requests for a given status, joined with the requesting member.
     * Ordered newest-first. Used by the admin withdrawals page.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findByStatusWithMember(string $status): array
    {
        return $this->query(
            "SELECT wr.*, u.`name` AS member_name, u.`email` AS member_email, u.`home_region` AS region
               FROM `withdrawal_requests` wr
               JOIN `users` u ON u.`id` = wr.`user_id`
              WHERE wr.`status` = ?
              ORDER BY wr.`created_at` DESC",
            [$status]
        );
    }

    /**
     * Returns the most recently paid withdrawal requests, joined with the requesting member.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findRecentPaidWithMember(int $limit = 10): array
    {
        return $this->query(
            "SELECT wr.*, u.`name` AS member_name, u.`email` AS member_email
               FROM `withdrawal_requests` wr
               JOIN `users` u ON u.`id` = wr.`user_id`
              WHERE wr.`status` = 'paid'
              ORDER BY wr.`paid_at` DESC
              LIMIT " . max(1, $limit)
        );
    }

    /**
     * Update the status of a withdrawal request.
     * Optionally record who reviewed it and any notes.
     */
    public function updateStatus(
        int     $id,
        string  $status,
        ?int    $reviewedBy = null,
        ?string $notes      = null
    ): bool {
        $data = ['status' => $status];

        if ($reviewedBy !== null) {
            $data['reviewed_by'] = $reviewedBy;
        }

        if ($notes !== null) {
            $data['notes'] = $notes;
        }

        return $this->update($id, $data);
    }
}
