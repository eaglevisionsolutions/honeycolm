<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;

class RefundService
{
    private SwarmModel    $swarmModel;
    private CombModel     $combModel;
    private WalletService $walletService;

    public function __construct(
        ?SwarmModel    $swarmModel    = null,
        ?CombModel     $combModel     = null,
        ?WalletService $walletService = null,
    ) {
        $this->swarmModel    = $swarmModel    ?? new SwarmModel();
        $this->combModel     = $combModel     ?? new CombModel();
        $this->walletService = $walletService ?? new WalletService();
    }

    /**
     * Refund all comb holders in a swarm. Groups combs by (user_id, bucket_source)
     * and refunds each group back to the correct wallet bucket.
     *
     * @return array{refunded_users: int, total_refunded: float}
     * @throws NotFoundException
     */
    public function refundSwarm(int $swarmId): array
    {
        $swarm = $this->swarmModel->findById($swarmId);
        $combs = $this->combModel->findBySwarm($swarmId);

        if (empty($combs)) {
            return ['refunded_users' => 0, 'total_refunded' => 0.0];
        }

        // Group combs by (user_id, bucket_source), sum the price_paid
        $grouped = $this->groupCombsByUserAndBucket($combs);

        $refundedUsers = [];
        $totalRefunded = 0.0;

        foreach ($grouped as $key => $amount) {
            [$userId, $bucketSource] = explode(':', $key);
            $userId = (int) $userId;

            $depositAmount = $bucketSource === 'deposit' ? $amount : 0.0;
            $bonusAmount   = $bucketSource === 'bonus'   ? $amount : 0.0;

            $this->walletService->refund(
                $userId,
                $depositAmount,
                $bonusAmount,
                'swarm',
                $swarmId
            );

            $refundedUsers[$userId] = true;
            $totalRefunded += $amount;
        }

        // Mark combs as refunded
        $this->combModel->markRefundedBySwarm($swarmId);

        return [
            'refunded_users' => count($refundedUsers),
            'total_refunded' => $totalRefunded,
        ];
    }

    /**
     * Processes all expired swarms (deadline has passed, status still active/filling_fast).
     * Transitions them to 'expired' and refunds all members.
     *
     * @return array{processed: int, details: array}
     */
    public function processExpiredSwarms(): array
    {
        $expiredSwarms = $this->swarmModel->findExpired();
        $details       = [];

        foreach ($expiredSwarms as $swarm) {
            $swarmId = (int) $swarm['id'];

            $this->swarmModel->transitionStatus($swarmId, 'expired');

            $refundResult = $this->refundSwarm($swarmId);

            $details[] = [
                'swarm_id'       => $swarmId,
                'title'          => $swarm['title'],
                'refunded_users' => $refundResult['refunded_users'],
                'total_refunded' => $refundResult['total_refunded'],
            ];
        }

        return [
            'processed' => count($details),
            'details'   => $details,
        ];
    }

    /**
     * Processes a cancelled swarm — refunds all members.
     * The swarm must already be in 'cancelled' status.
     *
     * @throws NotFoundException
     * @throws ValidationException
     * @return array{refunded_users: int, total_refunded: float}
     */
    public function processCancelledSwarm(int $swarmId): array
    {
        $swarm = $this->swarmModel->findById($swarmId);

        if ($swarm['status'] !== 'cancelled') {
            throw new ValidationException(['status' => 'Swarm must be in cancelled status to process refunds.']);
        }

        return $this->refundSwarm($swarmId);
    }

    /**
     * Groups combs by "userId:bucketSource" key with total price summed.
     *
     * @param array<int, array<string, mixed>> $combs
     * @return array<string, float>
     */
    private function groupCombsByUserAndBucket(array $combs): array
    {
        $grouped = [];

        foreach ($combs as $comb) {
            $key = $comb['user_id'] . ':' . $comb['bucket_source'];

            if (!isset($grouped[$key])) {
                $grouped[$key] = 0.0;
            }

            $grouped[$key] += (float) $comb['price_paid'];
        }

        return $grouped;
    }
}
