<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\WalletModel;
use App\Models\WalletTransactionModel;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;

class WalletService
{
    private WalletModel            $walletModel;
    private WalletTransactionModel $transactionModel;

    public function __construct(
        ?WalletModel            $walletModel      = null,
        ?WalletTransactionModel $transactionModel = null,
    ) {
        $this->walletModel      = $walletModel      ?? new WalletModel();
        $this->transactionModel = $transactionModel ?? new WalletTransactionModel();
    }

    /**
     * Return the live wallet balances for a user.
     *
     * @return array{deposit_balance: float, bonus_balance: float, total_balance: float, region_id: string}
     * @throws NotFoundException
     */
    public function getBalance(int $userId): array
    {
        $wallet = $this->requireWallet($userId);

        $deposit = (float) $wallet['deposit_balance'];
        $bonus   = (float) $wallet['bonus_balance'];

        return [
            'deposit_balance' => $deposit,
            'bonus_balance'   => $bonus,
            'total_balance'   => $deposit + $bonus,
            'region_id'       => $wallet['region_id'],
        ];
    }

    /**
     * Return paginated transaction history for a user's wallet.
     *
     * @return array{transactions: array<int, array<string, mixed>>, total: int, page: int, per_page: int}
     * @throws NotFoundException
     */
    public function getTransactionHistory(int $userId, int $page = 1, int $perPage = 20): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(50, $perPage));

        $wallet = $this->requireWallet($userId);
        $offset = ($page - 1) * $perPage;

        $result = $this->transactionModel->findByWalletId((int) $wallet['id'], $perPage, $offset);

        return [
            'transactions' => $result['rows'],
            'total'        => $result['total'],
            'page'         => $page,
            'per_page'     => $perPage,
        ];
    }

    /**
     * Deduct `$amount` from a user's wallet (bonus-first).
     * Records one or two wallet_transactions rows depending on which buckets
     * are consumed.
     *
     * @return array{deducted_deposit: float, deducted_bonus: float}
     * @throws NotFoundException
     * @throws ValidationException
     */
    public function deduct(int $userId, float $amount, string $referenceType, int $referenceId): array
    {
        if ($amount <= 0) {
            throw new ValidationException(['amount' => 'Deduction amount must be positive.']);
        }

        $wallet   = $this->requireWallet($userId);
        $walletId = (int) $wallet['id'];

        $result = $this->walletModel->deductWithLock($walletId, $amount);

        // Record bonus deduction row if any bonus was consumed
        if ($result['deducted_bonus'] > 0) {
            $this->transactionModel->record([
                'wallet_id'     => $walletId,
                'type'          => 'spend',
                'bucket'        => 'bonus',
                'amount'        => $result['deducted_bonus'],
                'balance_after' => $result['bonus_balance_after'],
                'reference_type' => $referenceType,
                'reference_id'  => $referenceId,
            ]);
        }

        // Record deposit deduction row if any deposit was consumed
        if ($result['deducted_deposit'] > 0) {
            $this->transactionModel->record([
                'wallet_id'     => $walletId,
                'type'          => 'spend',
                'bucket'        => 'deposit',
                'amount'        => $result['deducted_deposit'],
                'balance_after' => $result['deposit_balance_after'],
                'reference_type' => $referenceType,
                'reference_id'  => $referenceId,
            ]);
        }

        return [
            'deducted_deposit' => $result['deducted_deposit'],
            'deducted_bonus'   => $result['deducted_bonus'],
        ];
    }

    /**
     * Credit the deposit bucket (e.g. after a Stripe top-up).
     * Records a wallet_transactions row with type='topup'.
     *
     * @throws NotFoundException
     */
    public function creditDeposit(int $userId, float $amount, string $stripePaymentId): bool
    {
        if ($amount <= 0) {
            throw new ValidationException(['amount' => 'Credit amount must be positive.']);
        }

        $wallet   = $this->requireWallet($userId);
        $walletId = (int) $wallet['id'];

        $this->walletModel->creditDeposit($walletId, $amount);

        $newBalance = (float) $wallet['deposit_balance'] + $amount;

        $this->transactionModel->record([
            'wallet_id'        => $walletId,
            'type'             => 'topup',
            'bucket'           => 'deposit',
            'amount'           => $amount,
            'balance_after'    => $newBalance,
            'reference_type'   => null,
            'reference_id'     => null,
            'stripe_payment_id' => $stripePaymentId,
        ]);

        return true;
    }

    /**
     * Credit the bonus bucket (e.g. promotional award).
     * Records a wallet_transactions row with type='bonus'.
     *
     * @throws NotFoundException
     */
    public function creditBonus(int $userId, float $amount): bool
    {
        if ($amount <= 0) {
            throw new ValidationException(['amount' => 'Credit amount must be positive.']);
        }

        $wallet   = $this->requireWallet($userId);
        $walletId = (int) $wallet['id'];

        $this->walletModel->creditBonus($walletId, $amount);

        $newBalance = (float) $wallet['bonus_balance'] + $amount;

        $this->transactionModel->record([
            'wallet_id'     => $walletId,
            'type'          => 'bonus',
            'bucket'        => 'bonus',
            'amount'        => $amount,
            'balance_after' => $newBalance,
            'reference_type' => null,
            'reference_id'  => null,
        ]);

        return true;
    }

    /**
     * Refund back to the correct source buckets.
     * Records wallet_transactions rows with type='refund'.
     *
     * @throws NotFoundException
     */
    public function refund(
        int    $userId,
        float  $depositAmount,
        float  $bonusAmount,
        string $referenceType,
        int    $referenceId
    ): bool {
        $wallet   = $this->requireWallet($userId);
        $walletId = (int) $wallet['id'];

        if ($depositAmount > 0) {
            $this->walletModel->creditDeposit($walletId, $depositAmount);
            $newDeposit = (float) $wallet['deposit_balance'] + $depositAmount;

            $this->transactionModel->record([
                'wallet_id'     => $walletId,
                'type'          => 'refund',
                'bucket'        => 'deposit',
                'amount'        => $depositAmount,
                'balance_after' => $newDeposit,
                'reference_type' => $referenceType,
                'reference_id'  => $referenceId,
            ]);
        }

        if ($bonusAmount > 0) {
            $this->walletModel->creditBonus($walletId, $bonusAmount);
            $newBonus = (float) $wallet['bonus_balance'] + $bonusAmount;

            $this->transactionModel->record([
                'wallet_id'     => $walletId,
                'type'          => 'refund',
                'bucket'        => 'bonus',
                'amount'        => $bonusAmount,
                'balance_after' => $newBonus,
                'reference_type' => $referenceType,
                'reference_id'  => $referenceId,
            ]);
        }

        return true;
    }

    /**
     * Retrieve the first wallet for a user or throw NotFoundException.
     *
     * @throws NotFoundException
     */
    private function requireWallet(int $userId): array
    {
        $wallets = $this->walletModel->findByUserId($userId);

        if (empty($wallets)) {
            throw new NotFoundException("No wallet found for user #{$userId}.");
        }

        return $wallets[0];
    }
}
