<?php

declare(strict_types=1);

namespace App\Models;

class WalletTransactionModel extends BaseModel
{
    protected string $table      = 'wallet_transactions';
    protected string $primaryKey = 'id';

    /**
     * Record a single ledger entry.
     *
     * @param array{
     *   wallet_id:        int,
     *   type:             string,
     *   bucket:           string,
     *   amount:           float,
     *   balance_after:    float,
     *   reference_type:   string|null,
     *   reference_id:     int|null,
     *   stripe_payment_id?: string|null,
     *   notes?:           string|null
     * } $data
     */
    public function record(array $data): int
    {
        $row = [
            'wallet_id'      => $data['wallet_id'],
            'type'           => $data['type'],
            'bucket'         => $data['bucket'],
            'amount'         => $data['amount'],
            'balance_after'  => $data['balance_after'],
            'reference_type' => $data['reference_type'] ?? null,
            'reference_id'   => $data['reference_id']   ?? null,
        ];

        if (isset($data['stripe_payment_id'])) {
            $row['stripe_payment_id'] = $data['stripe_payment_id'];
        }

        if (isset($data['notes'])) {
            $row['notes'] = $data['notes'];
        }

        // wallet_transactions has no updated_at column — use a direct INSERT
        // that only sets created_at (not updated_at which BaseModel::insert() adds).
        $row['created_at'] = date('Y-m-d H:i:s');

        $columns      = array_map(fn($col) => "`{$col}`", array_keys($row));
        $placeholders = array_fill(0, count($row), '?');

        $sql = sprintf(
            "INSERT INTO `%s` (%s) VALUES (%s)",
            $this->table,
            implode(', ', $columns),
            implode(', ', $placeholders)
        );

        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_values($row));

        return (int) $this->db->lastInsertId();
    }

    /**
     * Find the first wallet_transaction row with a given stripe_payment_id.
     * Returns the row array or false if not found.
     *
     * @return array<string, mixed>|false
     */
    public function findByStripePaymentId(string $stripePaymentId): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `wallet_transactions` WHERE `stripe_payment_id` = ? LIMIT 1",
            [$stripePaymentId]
        );
    }

    /**
     * Paginated transaction history for a given wallet id.
     *
     * @return array{rows: array<int, array<string, mixed>>, total: int}
     */
    public function findByWalletId(int $walletId, int $limit, int $offset): array
    {
        $countStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM `wallet_transactions` WHERE `wallet_id` = ?"
        );
        $countStmt->execute([$walletId]);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->db->prepare(
            "SELECT * FROM `wallet_transactions`
             WHERE `wallet_id` = ?
             ORDER BY `created_at` DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute([$walletId, $limit, $offset]);
        $rows = $stmt->fetchAll();

        return ['rows' => $rows, 'total' => $total];
    }
}
