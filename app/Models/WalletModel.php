<?php

declare(strict_types=1);

namespace App\Models;

use App\Exceptions\ValidationException;

class WalletModel extends BaseModel
{
    protected string $table      = 'wallets';
    protected string $primaryKey = 'id';

    /**
     * Create a wallet for a newly registered user.
     * BaseModel::insert() adds created_at and updated_at automatically.
     */
    public function createForUser(int $userId, string $regionId): int
    {
        return $this->insert([
            'user_id'         => $userId,
            'region_id'       => $regionId,
            'deposit_balance' => 0.00,
            'bonus_balance'   => 0.00,
        ]);
    }

    /**
     * Return all wallet rows for a given user.
     */
    public function findByUserId(int $userId): array
    {
        return $this->query(
            "SELECT * FROM `wallets` WHERE `user_id` = ?",
            [$userId]
        );
    }

    /**
     * Atomically deduct `$amount` from a wallet using SELECT FOR UPDATE.
     * Bonus balance is consumed first; deposit covers the remainder.
     *
     * @return array{deducted_deposit: float, deducted_bonus: float, deposit_balance_after: float, bonus_balance_after: float}
     * @throws ValidationException when total balance < $amount
     */
    public function deductWithLock(int $walletId, float $amount): array
    {
        $this->db->beginTransaction();

        try {
            $stmt = $this->db->prepare(
                "SELECT `id`, `deposit_balance`, `bonus_balance`
                 FROM `wallets`
                 WHERE `id` = ?
                 FOR UPDATE"
            );
            $stmt->execute([$walletId]);
            $wallet = $stmt->fetch();

            if ($wallet === false) {
                $this->db->rollBack();
                throw new ValidationException(['wallet' => 'Wallet not found.']);
            }

            $deposit = (float) $wallet['deposit_balance'];
            $bonus   = (float) $wallet['bonus_balance'];
            $total   = $deposit + $bonus;

            if ($total < $amount) {
                $this->db->rollBack();
                throw new ValidationException(['wallet' => 'Insufficient Nectar balance.']);
            }

            // Spend bonus first
            $deductedBonus = min($bonus, $amount);
            $remaining     = $amount - $deductedBonus;
            $deductedDeposit = $remaining;

            $newBonus   = $bonus   - $deductedBonus;
            $newDeposit = $deposit - $deductedDeposit;

            $update = $this->db->prepare(
                "UPDATE `wallets`
                 SET `deposit_balance` = ?, `bonus_balance` = ?, `updated_at` = NOW()
                 WHERE `id` = ?"
            );
            $update->execute([$newDeposit, $newBonus, $walletId]);

            $this->db->commit();

            return [
                'deducted_deposit'      => $deductedDeposit,
                'deducted_bonus'        => $deductedBonus,
                'deposit_balance_after' => $newDeposit,
                'bonus_balance_after'   => $newBonus,
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Atomically deduct `$amount` from the deposit bucket only using SELECT FOR UPDATE.
     * Used for withdrawals where bonus balance must not be touched.
     *
     * @return float The new deposit_balance after deduction
     * @throws ValidationException when deposit_balance < $amount or wallet not found
     */
    public function deductDepositWithLock(int $walletId, float $amount): float
    {
        $this->db->beginTransaction();

        try {
            $stmt = $this->db->prepare(
                "SELECT `id`, `deposit_balance`
                 FROM `wallets`
                 WHERE `id` = ?
                 FOR UPDATE"
            );
            $stmt->execute([$walletId]);
            $wallet = $stmt->fetch();

            if ($wallet === false) {
                $this->db->rollBack();
                throw new ValidationException(['wallet' => 'Wallet not found.']);
            }

            $deposit = (float) $wallet['deposit_balance'];

            if ($deposit < $amount) {
                $this->db->rollBack();
                throw new ValidationException(
                    ['amount' => 'Withdrawal amount exceeds your available deposit balance.']
                );
            }

            $newDeposit = $deposit - $amount;

            $update = $this->db->prepare(
                "UPDATE `wallets`
                 SET `deposit_balance` = ?, `updated_at` = NOW()
                 WHERE `id` = ?"
            );
            $update->execute([$newDeposit, $walletId]);

            $this->db->commit();

            return $newDeposit;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Add to the deposit bucket.
     */
    public function creditDeposit(int $walletId, float $amount): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `wallets`
             SET `deposit_balance` = `deposit_balance` + ?, `updated_at` = NOW()
             WHERE `id` = ?"
        );
        $stmt->execute([$amount, $walletId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Add to the bonus bucket.
     */
    public function creditBonus(int $walletId, float $amount): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `wallets`
             SET `bonus_balance` = `bonus_balance` + ?, `updated_at` = NOW()
             WHERE `id` = ?"
        );
        $stmt->execute([$amount, $walletId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Applies a signed adjustment to a single bucket (deposit or bonus) using
     * SELECT FOR UPDATE. Used for manual admin Nectar adjustments, where the
     * amount can be positive (credit) or negative (debit).
     *
     * @return float The bucket's new balance after the adjustment.
     * @throws ValidationException when the bucket is invalid or the result would be negative
     */
    public function adjustBucket(int $walletId, string $bucket, float $amount): float
    {
        if (!in_array($bucket, ['deposit', 'bonus'], true)) {
            throw new ValidationException(['bucket' => 'Bucket must be "deposit" or "bonus".']);
        }
        $column = "{$bucket}_balance";

        $this->db->beginTransaction();

        try {
            $stmt = $this->db->prepare(
                "SELECT `id`, `{$column}` FROM `wallets` WHERE `id` = ? FOR UPDATE"
            );
            $stmt->execute([$walletId]);
            $wallet = $stmt->fetch();

            if ($wallet === false) {
                $this->db->rollBack();
                throw new ValidationException(['wallet' => 'Wallet not found.']);
            }

            $newBalance = (float) $wallet[$column] + $amount;

            if ($newBalance < 0) {
                $this->db->rollBack();
                throw new ValidationException(['amount' => 'Adjustment would result in a negative balance.']);
            }

            $update = $this->db->prepare(
                "UPDATE `wallets` SET `{$column}` = ?, `updated_at` = NOW() WHERE `id` = ?"
            );
            $update->execute([$newBalance, $walletId]);

            $this->db->commit();

            return $newBalance;
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }
}
