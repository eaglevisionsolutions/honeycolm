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
