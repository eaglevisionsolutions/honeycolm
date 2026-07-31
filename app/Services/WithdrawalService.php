<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\WithdrawalRequestModel;
use App\Models\WalletModel;
use App\Models\WalletTransactionModel;
use App\Exceptions\ValidationException;

class WithdrawalService
{
    public function __construct(
        private WithdrawalRequestModel $withdrawalModel  = new WithdrawalRequestModel(),
        private WalletModel            $walletModel      = new WalletModel(),
        private WalletTransactionModel $transactionModel = new WalletTransactionModel(),
    ) {}

    /**
     * Returns withdrawal requests for a given status, with member info attached.
     */
    public function listByStatus(string $status): array
    {
        $allowed = ['pending', 'approved', 'rejected', 'paid'];
        if (!in_array($status, $allowed, true)) {
            throw new ValidationException(['status' => 'Status must be one of: ' . implode(', ', $allowed)]);
        }

        return $this->withdrawalModel->findByStatusWithMember($status);
    }

    /**
     * Transitions a withdrawal request's status.
     * pending -> approved | rejected
     * approved -> paid
     *
     * Rejecting refunds the reserved deposit amount, since it was deducted
     * at request time (see StripeService::requestWithdrawal).
     *
     * @throws ValidationException
     */
    public function updateStatus(int $id, string $newStatus, ?string $notes, int $adminStaffId): array
    {
        $withdrawal = $this->withdrawalModel->findById($id);
        $current    = $withdrawal['status'];

        $validTransitions = [
            'pending'  => ['approved', 'rejected'],
            'approved' => ['paid'],
        ];

        if (!isset($validTransitions[$current]) || !in_array($newStatus, $validTransitions[$current], true)) {
            throw new ValidationException([
                'status' => "Cannot transition a withdrawal from \"{$current}\" to \"{$newStatus}\".",
            ]);
        }

        if ($newStatus === 'rejected' && empty(trim((string) $notes))) {
            throw new ValidationException(['notes' => 'A reason is required when rejecting a withdrawal.']);
        }

        if ($newStatus === 'rejected') {
            $walletId = (int) $withdrawal['wallet_id'];
            $amount   = (float) $withdrawal['amount'];

            $this->walletModel->creditDeposit($walletId, $amount);
            $wallet = $this->walletModel->findById($walletId);

            $this->transactionModel->record([
                'wallet_id'      => $walletId,
                'type'           => 'refund',
                'bucket'         => 'deposit',
                'amount'         => $amount,
                'balance_after'  => (float) $wallet['deposit_balance'],
                'reference_type' => 'withdrawal',
                'reference_id'   => $id,
                'notes'          => $notes,
            ]);
        }

        $data = [
            'status'      => $newStatus,
            'reviewed_by' => $adminStaffId,
            'reviewed_at' => date('Y-m-d H:i:s'),
        ];
        if ($notes !== null) {
            $data['notes'] = $notes;
        }
        if ($newStatus === 'paid') {
            $data['paid_at'] = date('Y-m-d H:i:s');
        }

        $this->withdrawalModel->update($id, $data);

        return $this->withdrawalModel->findById($id);
    }
}
