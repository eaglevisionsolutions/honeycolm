<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\UserModel;
use App\Models\WalletModel;
use App\Models\WalletTransactionModel;
use App\Models\CombModel;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;
use App\Config\Database;
use PDO;

class MemberService
{
    private PDO $db;

    public function __construct(
        private UserModel              $userModel        = new UserModel(),
        private WalletModel            $walletModel      = new WalletModel(),
        private WalletTransactionModel $transactionModel = new WalletTransactionModel(),
        private CombModel              $combModel        = new CombModel(),
        ?PDO                            $db               = null,
    ) {
        $this->db = $db ?? Database::connection();
    }

    /**
     * Returns a paginated, filtered member list for the admin panel.
     * Filters: status ('active'|'deactivated'), search (name/email).
     *
     * @return array{members: array, pagination: array{total: int, total_pages: int}}
     */
    public function listMembers(array $filters, int $page, int $perPage): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        $where  = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[]  = 'u.`is_active` = ?';
            $params[] = $filters['status'] === 'active' ? 1 : 0;
        }

        if (!empty($filters['search'])) {
            $where[]  = '(u.`name` LIKE ? OR u.`email` LIKE ?)';
            $like     = '%' . $filters['search'] . '%';
            $params[] = $like;
            $params[] = $like;
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM `users` u {$whereClause}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $offset     = ($page - 1) * $perPage;
        $dataParams = $params;
        $dataParams[] = $perPage;
        $dataParams[] = $offset;

        $stmt = $this->db->prepare(
            "SELECT u.`id`, u.`name`, u.`email`, u.`home_region`, u.`is_active`, u.`created_at`,
                    w.`deposit_balance`, w.`bonus_balance`
               FROM `users` u
               LEFT JOIN `wallets` w ON w.`user_id` = u.`id`
              {$whereClause}
              ORDER BY u.`created_at` DESC
              LIMIT ? OFFSET ?"
        );
        $stmt->execute($dataParams);
        $rows = $stmt->fetchAll();

        $members = array_map(fn($row) => $this->formatMemberSummary($row), $rows);

        return [
            'members'    => $members,
            'pagination' => [
                'total'       => $total,
                'total_pages' => (int) max(1, ceil($total / $perPage)),
            ],
        ];
    }

    /**
     * Returns full member detail: account info, wallet, transaction history,
     * and entered Swarms.
     *
     * @throws NotFoundException
     */
    public function getMemberDetail(int $id): array
    {
        $user = $this->userModel->findById($id);
        unset($user['password_hash']);

        $wallets = $this->walletModel->findByUserId($id);
        $wallet  = $wallets[0] ?? null;

        $transactions = [];
        if ($wallet !== null) {
            $result       = $this->transactionModel->findByWalletId((int) $wallet['id'], 500, 0);
            $transactions = $result['rows'];
        }

        $swarms = $this->combModel->findSwarmsByUser($id);

        return array_merge($user, [
            'status'       => (int) ($user['is_active'] ?? 1) === 1 ? 'active' : 'deactivated',
            'region'       => $user['home_region'] ?? null,
            'wallet'       => $wallet !== null ? [
                'deposit_balance' => (float) $wallet['deposit_balance'],
                'bonus_balance'   => (float) $wallet['bonus_balance'],
                'total'           => (float) $wallet['deposit_balance'] + (float) $wallet['bonus_balance'],
            ] : null,
            'transactions' => $transactions,
            'swarms'       => $swarms,
        ]);
    }

    /**
     * Updates a member's active status.
     *
     * @throws NotFoundException
     * @throws ValidationException
     */
    public function updateStatus(int $id, string $status): array
    {
        if (!in_array($status, ['active', 'deactivated'], true)) {
            throw new ValidationException(['status' => 'Status must be "active" or "deactivated".']);
        }

        $this->userModel->findById($id); // throws NotFoundException if missing
        $this->userModel->update($id, ['is_active' => $status === 'active' ? 1 : 0]);

        return $this->getMemberDetail($id);
    }

    /**
     * Applies a manual signed Nectar adjustment to a member's wallet.
     *
     * @throws NotFoundException
     * @throws ValidationException
     */
    public function adjustWallet(int $id, float $amount, string $bucket, string $notes): array
    {
        if ($amount == 0.0) {
            throw new ValidationException(['amount' => 'Amount must be non-zero.']);
        }
        if (empty(trim($notes))) {
            throw new ValidationException(['notes' => 'Notes are required.']);
        }

        $this->userModel->findById($id); // throws NotFoundException if missing

        $wallets = $this->walletModel->findByUserId($id);
        if (empty($wallets)) {
            throw new NotFoundException("No wallet found for member #{$id}.");
        }
        $walletId = (int) $wallets[0]['id'];

        $newBalance = $this->walletModel->adjustBucket($walletId, $bucket, $amount);

        $this->transactionModel->record([
            'wallet_id'      => $walletId,
            'type'           => 'admin_adjustment',
            'bucket'         => $bucket,
            'amount'         => $amount,
            'balance_after'  => $newBalance,
            'reference_type' => 'admin_adjustment',
            'reference_id'   => null,
            'notes'          => $notes,
        ]);

        return $this->getMemberDetail($id);
    }

    private function formatMemberSummary(array $row): array
    {
        $deposit = (float) ($row['deposit_balance'] ?? 0);
        $bonus   = (float) ($row['bonus_balance'] ?? 0);

        return [
            'id'         => (int) $row['id'],
            'name'       => $row['name'],
            'email'      => $row['email'],
            'region'     => $row['home_region'],
            'status'     => (int) $row['is_active'] === 1 ? 'active' : 'deactivated',
            'created_at' => $row['created_at'],
            'wallet'     => [
                'deposit_balance' => $deposit,
                'bonus_balance'   => $bonus,
                'total'           => $deposit + $bonus,
            ],
        ];
    }
}
