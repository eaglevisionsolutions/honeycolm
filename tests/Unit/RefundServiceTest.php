<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\RefundService;
use App\Services\WalletService;
use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;

class RefundServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function fakeSwarm(array $overrides = []): array
    {
        return array_merge([
            'id'         => 1,
            'title'      => 'Test Swarm',
            'region_id'  => 'ca',
            'status'     => 'cancelled',
            'comb_count' => 100,
            'combs_sold' => 50,
            'comb_price' => 5.00,
        ], $overrides);
    }

    private function fakeComb(array $overrides = []): array
    {
        return array_merge([
            'id'            => 1,
            'swarm_id'      => 1,
            'user_id'       => 42,
            'comb_number'   => 1,
            'bucket_source' => 'deposit',
            'price_paid'    => '5.00',
            'user_name'     => 'Jane Bee',
        ], $overrides);
    }

    /**
     * @return array{RefundService, MockObject&SwarmModel, MockObject&CombModel, MockObject&WalletService}
     */
    private function buildServiceWithMocks(): array
    {
        /** @var MockObject&SwarmModel $swarmModel */
        $swarmModel = $this->createMock(SwarmModel::class);
        /** @var MockObject&CombModel $combModel */
        $combModel = $this->createMock(CombModel::class);
        /** @var MockObject&WalletService $walletService */
        $walletService = $this->createMock(WalletService::class);

        $service = new RefundService($swarmModel, $combModel, $walletService);

        return [$service, $swarmModel, $combModel, $walletService];
    }

    // -------------------------------------------------------------------------
    // refundSwarm — returns to source bucket
    // -------------------------------------------------------------------------

    public function testRefundReturnsToSourceBucket(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());

        // User 42 has 2 deposit combs and 1 bonus comb
        $combs = [
            $this->fakeComb(['id' => 1, 'user_id' => 42, 'comb_number' => 1, 'bucket_source' => 'deposit', 'price_paid' => '5.00']),
            $this->fakeComb(['id' => 2, 'user_id' => 42, 'comb_number' => 2, 'bucket_source' => 'deposit', 'price_paid' => '5.00']),
            $this->fakeComb(['id' => 3, 'user_id' => 42, 'comb_number' => 3, 'bucket_source' => 'bonus',   'price_paid' => '5.00']),
        ];

        $combModel->method('findUnrefundedBySwarm')->with(1)->willReturn($combs);
        $combModel->method('markRefundedBySwarm')->with(1)->willReturn(true);

        // Expect two refund calls: one for deposit (10.00), one for bonus (5.00)
        $refundCalls = [];
        $walletService->expects($this->exactly(2))
            ->method('refund')
            ->willReturnCallback(function (int $userId, float $deposit, float $bonus, string $refType, int $refId) use (&$refundCalls): bool {
                $refundCalls[] = [
                    'user_id'        => $userId,
                    'deposit_amount' => $deposit,
                    'bonus_amount'   => $bonus,
                    'reference_type' => $refType,
                    'reference_id'   => $refId,
                ];
                return true;
            });

        $result = $service->refundSwarm(1);

        $this->assertSame(1, $result['refunded_users']);
        $this->assertSame(15.0, $result['total_refunded']);

        // Verify deposit refund call
        $depositCall = null;
        $bonusCall   = null;
        foreach ($refundCalls as $call) {
            if ($call['deposit_amount'] > 0) {
                $depositCall = $call;
            }
            if ($call['bonus_amount'] > 0) {
                $bonusCall = $call;
            }
        }

        $this->assertNotNull($depositCall);
        $this->assertSame(42, $depositCall['user_id']);
        $this->assertSame(10.0, $depositCall['deposit_amount']);
        $this->assertSame(0.0, $depositCall['bonus_amount']);

        $this->assertNotNull($bonusCall);
        $this->assertSame(42, $bonusCall['user_id']);
        $this->assertSame(0.0, $bonusCall['deposit_amount']);
        $this->assertSame(5.0, $bonusCall['bonus_amount']);
    }

    // -------------------------------------------------------------------------
    // refundSwarm — multiple users are refunded
    // -------------------------------------------------------------------------

    public function testRefundSwarmRefundsMultipleUsers(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());

        // User 42 has 1 deposit comb, User 99 has 1 bonus comb
        $combs = [
            $this->fakeComb(['id' => 1, 'user_id' => 42, 'comb_number' => 1, 'bucket_source' => 'deposit', 'price_paid' => '5.00']),
            $this->fakeComb(['id' => 2, 'user_id' => 99, 'comb_number' => 2, 'bucket_source' => 'bonus',   'price_paid' => '5.00']),
        ];

        $combModel->method('findUnrefundedBySwarm')->with(1)->willReturn($combs);
        $combModel->method('markRefundedBySwarm')->with(1)->willReturn(true);

        $refundCalls = [];
        $walletService->expects($this->exactly(2))
            ->method('refund')
            ->willReturnCallback(function (int $userId, float $deposit, float $bonus, string $refType, int $refId) use (&$refundCalls): bool {
                $refundCalls[] = ['user_id' => $userId, 'deposit_amount' => $deposit, 'bonus_amount' => $bonus];
                return true;
            });

        $result = $service->refundSwarm(1);

        $this->assertSame(2, $result['refunded_users']);
        $this->assertSame(10.0, $result['total_refunded']);

        // User 42 should get deposit refund
        $user42Call = array_values(array_filter($refundCalls, fn($c) => $c['user_id'] === 42));
        $this->assertCount(1, $user42Call);
        $this->assertSame(5.0, $user42Call[0]['deposit_amount']);
        $this->assertSame(0.0, $user42Call[0]['bonus_amount']);

        // User 99 should get bonus refund
        $user99Call = array_values(array_filter($refundCalls, fn($c) => $c['user_id'] === 99));
        $this->assertCount(1, $user99Call);
        $this->assertSame(0.0, $user99Call[0]['deposit_amount']);
        $this->assertSame(5.0, $user99Call[0]['bonus_amount']);
    }

    // -------------------------------------------------------------------------
    // refundSwarm — empty swarm returns zero
    // -------------------------------------------------------------------------

    public function testRefundSwarmHandlesEmptySwarm(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());
        $combModel->method('findUnrefundedBySwarm')->with(1)->willReturn([]);

        // No refund calls should happen
        $walletService->expects($this->never())->method('refund');

        $result = $service->refundSwarm(1);

        $this->assertSame(0, $result['refunded_users']);
        $this->assertSame(0.0, $result['total_refunded']);
    }

    // -------------------------------------------------------------------------
    // processExpiredSwarms — refunds all expired
    // -------------------------------------------------------------------------

    public function testProcessExpiredSwarmsRefundsAllMembers(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        // Two expired swarms
        $expiredSwarms = [
            $this->fakeSwarm(['id' => 10, 'title' => 'Expired A', 'status' => 'active']),
            $this->fakeSwarm(['id' => 20, 'title' => 'Expired B', 'status' => 'filling_fast']),
        ];

        $swarmModel->method('findExpired')->willReturn($expiredSwarms);

        // For findById calls during refundSwarm
        $swarmModel->method('findById')
            ->willReturnCallback(fn(int $id) => $this->fakeSwarm(['id' => $id]));

        // Each swarm has 1 comb to refund
        $combModel->method('findUnrefundedBySwarm')->willReturnCallback(function (int $swarmId): array {
            return [
                $this->fakeComb([
                    'swarm_id'      => $swarmId,
                    'user_id'       => 42,
                    'bucket_source' => 'deposit',
                    'price_paid'    => '5.00',
                ]),
            ];
        });

        $combModel->method('markRefundedBySwarm')->willReturn(true);

        // Expect transitions to 'expired'
        $transitionCalls = [];
        $swarmModel->expects($this->exactly(2))
            ->method('transitionStatus')
            ->willReturnCallback(function (int $swarmId, string $status) use (&$transitionCalls): bool {
                $transitionCalls[] = ['swarm_id' => $swarmId, 'status' => $status];
                return true;
            });

        $walletService->method('refund')->willReturn(true);

        $result = $service->processExpiredSwarms();

        $this->assertSame(2, $result['processed']);
        $this->assertCount(2, $result['details']);

        // Verify transitions were to 'expired'
        foreach ($transitionCalls as $call) {
            $this->assertSame('expired', $call['status']);
        }
    }

    // -------------------------------------------------------------------------
    // processExpiredSwarms — no expired swarms
    // -------------------------------------------------------------------------

    public function testProcessExpiredSwarmsHandlesNone(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findExpired')->willReturn([]);

        $result = $service->processExpiredSwarms();

        $this->assertSame(0, $result['processed']);
        $this->assertEmpty($result['details']);
    }

    // -------------------------------------------------------------------------
    // processCancelledSwarm — fails if not cancelled
    // -------------------------------------------------------------------------

    public function testProcessCancelledSwarmFailsWhenNotCancelled(): void
    {
        [$service, $swarmModel] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn(
            $this->fakeSwarm(['status' => 'active'])
        );

        $this->expectException(ValidationException::class);

        try {
            $service->processCancelledSwarm(1);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->getErrors());
            throw $e;
        }
    }

    // -------------------------------------------------------------------------
    // processCancelledSwarm — succeeds when cancelled
    // -------------------------------------------------------------------------

    public function testProcessCancelledSwarmSucceeds(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn(
            $this->fakeSwarm(['status' => 'cancelled'])
        );

        $combs = [
            $this->fakeComb(['user_id' => 42, 'bucket_source' => 'deposit', 'price_paid' => '5.00']),
        ];

        $combModel->method('findUnrefundedBySwarm')->with(1)->willReturn($combs);
        $combModel->method('markRefundedBySwarm')->with(1)->willReturn(true);
        $walletService->method('refund')->willReturn(true);

        $result = $service->processCancelledSwarm(1);

        $this->assertSame(1, $result['refunded_users']);
        $this->assertSame(5.0, $result['total_refunded']);
    }

    // -------------------------------------------------------------------------
    // refundSwarm — throws NotFoundException when swarm missing
    // -------------------------------------------------------------------------

    public function testRefundSwarmThrowsNotFoundWhenSwarmMissing(): void
    {
        [$service, $swarmModel] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')
            ->willThrowException(new NotFoundException('swarms #999 not found'));

        $this->expectException(NotFoundException::class);

        $service->refundSwarm(999);
    }

    // -------------------------------------------------------------------------
    // refundSwarm — double refund prevention (security test)
    // -------------------------------------------------------------------------

    public function testRefundSwarmSkipsAlreadyRefundedCombs(): void
    {
        [$service, $swarmModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm());

        // On second call, findUnrefundedBySwarm returns empty (all combs already refunded)
        $combModel->method('findUnrefundedBySwarm')->with(1)->willReturn([]);

        // No refund calls should happen
        $walletService->expects($this->never())->method('refund');

        $result = $service->refundSwarm(1);

        $this->assertSame(0, $result['refunded_users']);
        $this->assertSame(0.0, $result['total_refunded']);
    }
}
