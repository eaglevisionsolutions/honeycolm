<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\SwarmService;
use App\Services\WalletService;
use App\Models\SwarmModel;
use App\Models\CombModel;
use App\Models\UserModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;

class SwarmServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function fakeSwarm(array $overrides = []): array
    {
        return array_merge([
            'id'                     => 1,
            'title'                  => 'Test Swarm',
            'region_id'              => 'ca',
            'status'                 => 'active',
            'comb_count'             => 100,
            'combs_sold'             => 10,
            'comb_price'             => 5.00,
            'per_member_comb_limit'  => null,
            'filling_fast_threshold' => 20,
        ], $overrides);
    }

    private function fakeUser(array $overrides = []): array
    {
        return array_merge([
            'id'          => 42,
            'name'        => 'Jane Bee',
            'email'       => 'jane@example.com',
            'home_region' => 'ca',
            'role'        => 'member',
        ], $overrides);
    }

    /**
     * @return array{SwarmService, MockObject&SwarmModel, MockObject&UserModel, MockObject&CombModel, MockObject&WalletService}
     */
    private function buildServiceWithMocks(): array
    {
        /** @var MockObject&SwarmModel $swarmModel */
        $swarmModel = $this->createMock(SwarmModel::class);
        /** @var MockObject&CombModel $combModel */
        $combModel = $this->createMock(CombModel::class);
        /** @var MockObject&UserModel $userModel */
        $userModel = $this->createMock(UserModel::class);
        /** @var MockObject&WalletService $walletService */
        $walletService = $this->createMock(WalletService::class);

        // SwarmService constructor: SwarmModel, CombModel, UserModel, ProductModel, WalletService
        $service = new SwarmService($swarmModel, $combModel, $userModel, null, $walletService);

        return [$service, $swarmModel, $userModel, $combModel, $walletService];
    }

    // -------------------------------------------------------------------------
    // purchaseCombs — region lock
    // -------------------------------------------------------------------------

    /**
     * Validation Criteria #7: swarm.region_id='ca', user.home_region='ca' — proceeds.
     */
    public function testPurchaseCombsSucceedsWhenRegionsMatch(): void
    {
        [$service, $swarmModel, $userModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarm = $this->fakeSwarm(['region_id' => 'ca', 'comb_count' => 100, 'combs_sold' => 10]);
        $updatedSwarm = $this->fakeSwarm([
            'region_id'  => 'ca',
            'comb_count' => 100,
            'combs_sold' => 13,
            'status'     => 'active',
        ]);

        $swarmModel->method('findById')->with(1)->willReturn($swarm);
        $userModel->method('findById')->with(42)->willReturn($this->fakeUser(['home_region' => 'ca']));
        $combModel->method('getNextCombNumbers')->with(1, 3)->willReturn([11, 12, 13]);
        $combModel->method('insertBatch');
        $swarmModel->method('incrementCombsSold')->with(1, 3)->willReturn($updatedSwarm);
        $swarmModel->method('transitionStatus');

        $walletService->method('deduct')->willReturn([
            'deducted_deposit' => 15.00,
            'deducted_bonus'   => 0.00,
        ]);
        $walletService->method('getBalance')->willReturn([
            'deposit_balance' => 85.00,
            'bonus_balance'   => 0.00,
            'total_balance'   => 85.00,
            'region_id'       => 'ca',
        ]);

        $result = $service->purchaseCombs(42, 1, 3);

        $this->assertIsArray($result);
        $this->assertArrayHasKey('combs_purchased', $result);
        $this->assertArrayHasKey('new_wallet_balance', $result);
        $this->assertArrayHasKey('swarm_filled', $result);
        $this->assertFalse($result['swarm_filled']);
    }

    /**
     * Validation Criteria #6: swarm.region_id='us', user.home_region='ca' — throws ValidationException.
     */
    public function testPurchaseCombsThrowsWhenRegionMismatch(): void
    {
        [$service, $swarmModel, $userModel] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->with(1)->willReturn($this->fakeSwarm(['region_id' => 'us']));
        $userModel->method('findById')->with(42)->willReturn($this->fakeUser(['home_region' => 'ca']));

        $this->expectException(ValidationException::class);

        try {
            $service->purchaseCombs(42, 1, 3);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('region', $e->getErrors());
            $this->assertSame(
                'You can only enter Swarms in your registered home region.',
                $e->getErrors()['region']
            );
            throw $e;
        }
    }

    /**
     * When the swarm does not exist, NotFoundException propagates.
     */
    public function testPurchaseCombsThrowsNotFoundWhenSwarmMissing(): void
    {
        [$service, $swarmModel] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')
            ->willThrowException(new NotFoundException('swarms #999 not found'));

        $this->expectException(NotFoundException::class);

        $service->purchaseCombs(42, 999, 1);
    }

    /**
     * When the user does not exist, NotFoundException propagates.
     */
    public function testPurchaseCombsThrowsNotFoundWhenUserMissing(): void
    {
        [$service, $swarmModel, $userModel] = $this->buildServiceWithMocks();

        $swarmModel->method('findById')->willReturn($this->fakeSwarm());
        $userModel->method('findById')
            ->willThrowException(new NotFoundException('users #999 not found'));

        $this->expectException(NotFoundException::class);

        $service->purchaseCombs(999, 1, 1);
    }

    // -------------------------------------------------------------------------
    // Task 9 — Validation Criteria tests (items 2–7)
    // -------------------------------------------------------------------------

    /**
     * Validation Criteria #2: wallet with Nt 3 bonus + Nt 97 deposit, purchase 5 combs
     * at Nt 1 each: bonus becomes 0, deposit becomes 95.
     */
    public function testPurchaseCombsDeductsBonusFirst(): void
    {
        [$service, $swarmModel, $userModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        $swarm = $this->fakeSwarm([
            'comb_price'  => 1.00,
            'comb_count'  => 100,
            'combs_sold'  => 50,
            'region_id'   => 'ca',
        ]);

        $updatedSwarm = $this->fakeSwarm([
            'comb_price'  => 1.00,
            'comb_count'  => 100,
            'combs_sold'  => 55,
            'region_id'   => 'ca',
            'status'      => 'active',
        ]);

        $swarmModel->method('findById')->willReturn($swarm);
        $userModel->method('findById')->willReturn($this->fakeUser(['home_region' => 'ca']));
        $combModel->method('countByUserAndSwarm')->willReturn(0);
        $combModel->method('getNextCombNumbers')->willReturn([51, 52, 53, 54, 55]);
        $combModel->method('insertBatch');
        $swarmModel->method('incrementCombsSold')->willReturn($updatedSwarm);
        $swarmModel->method('transitionStatus');

        // WalletService::deduct returns bonus-first split: 3 from bonus, 2 from deposit
        $walletService->method('deduct')->willReturn([
            'deducted_bonus'   => 3.00,
            'deducted_deposit' => 2.00,
        ]);

        // New balance after deduction: bonus=0, deposit=95
        $walletService->method('getBalance')->willReturn([
            'deposit_balance' => 95.00,
            'bonus_balance'   => 0.00,
            'total_balance'   => 95.00,
            'region_id'       => 'ca',
        ]);

        $result = $service->purchaseCombs(42, 1, 5);

        $this->assertSame(0.00, $result['new_wallet_balance']['bonus_balance']);
        $this->assertSame(95.00, $result['new_wallet_balance']['deposit_balance']);

        // Verify first 3 combs have bucket_source='bonus', last 2 have 'deposit'
        $combs = $result['combs_purchased'];
        $this->assertCount(5, $combs);
        $this->assertSame('bonus',   $combs[0]['bucket_source']);
        $this->assertSame('bonus',   $combs[1]['bucket_source']);
        $this->assertSame('bonus',   $combs[2]['bucket_source']);
        $this->assertSame('deposit', $combs[3]['bucket_source']);
        $this->assertSame('deposit', $combs[4]['bucket_source']);
    }

    /**
     * Validation Criteria #3: swarm with per_member_comb_limit=3, member already holds 2,
     * attempts to buy 2 more: throws ValidationException.
     */
    public function testPurchaseCombsFailsWhenExceedsPerMemberLimit(): void
    {
        [$service, $swarmModel, $userModel, $combModel] = $this->buildServiceWithMocks();

        $swarm = $this->fakeSwarm([
            'per_member_comb_limit' => 3,
            'region_id'             => 'ca',
        ]);

        $swarmModel->method('findById')->willReturn($swarm);
        $userModel->method('findById')->willReturn($this->fakeUser(['home_region' => 'ca']));

        // Member already holds 2 combs
        $combModel->method('countByUserAndSwarm')->willReturn(2);

        $this->expectException(ValidationException::class);

        try {
            $service->purchaseCombs(42, 1, 2);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('quantity', $e->getErrors());
            throw $e;
        }
    }

    /**
     * Validation Criteria #4: swarm with status='draft': throws exception.
     */
    public function testPurchaseCombsFailsWhenSwarmNotActive(): void
    {
        [$service, $swarmModel, $userModel] = $this->buildServiceWithMocks();

        $swarm = $this->fakeSwarm(['status' => 'draft', 'region_id' => 'ca']);

        $swarmModel->method('findById')->willReturn($swarm);
        $userModel->method('findById')->willReturn($this->fakeUser(['home_region' => 'ca']));

        $this->expectException(ValidationException::class);

        try {
            $service->purchaseCombs(42, 1, 1);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('swarm', $e->getErrors());
            throw $e;
        }
    }

    /**
     * Validation Criteria #5: purchase last available Combs → swarm status changes to 'full'.
     */
    public function testPurchaseCombsDetectsSwarmFill(): void
    {
        [$service, $swarmModel, $userModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        // 100 combs, 99 sold — buying 1 fills the swarm
        $swarm = $this->fakeSwarm([
            'comb_count'  => 100,
            'combs_sold'  => 99,
            'region_id'   => 'ca',
            'status'      => 'active',
        ]);

        // After increment: combs_sold == comb_count
        $updatedSwarm = $this->fakeSwarm([
            'comb_count'  => 100,
            'combs_sold'  => 100,
            'region_id'   => 'ca',
            'status'      => 'active',
        ]);

        $swarmModel->method('findById')->willReturn($swarm);
        $userModel->method('findById')->willReturn($this->fakeUser(['home_region' => 'ca']));
        $combModel->method('countByUserAndSwarm')->willReturn(0);
        $combModel->method('getNextCombNumbers')->willReturn([100]);
        $combModel->method('insertBatch');
        $swarmModel->method('incrementCombsSold')->willReturn($updatedSwarm);

        // Expect transitionStatus called with 'full'
        $swarmModel->expects($this->once())
            ->method('transitionStatus')
            ->with(1, 'full');

        $walletService->method('deduct')->willReturn([
            'deducted_bonus'   => 0.00,
            'deducted_deposit' => 5.00,
        ]);
        $walletService->method('getBalance')->willReturn([
            'deposit_balance' => 95.00,
            'bonus_balance'   => 0.00,
            'total_balance'   => 95.00,
            'region_id'       => 'ca',
        ]);

        $result = $service->purchaseCombs(42, 1, 1);

        $this->assertTrue($result['swarm_filled']);
    }

    /**
     * Validation Criteria #6: when combs_remaining falls below filling_fast_threshold%,
     * status transitions to 'filling_fast'.
     */
    public function testFillingFastStatusTransition(): void
    {
        [$service, $swarmModel, $userModel, $combModel, $walletService] = $this->buildServiceWithMocks();

        // 100 combs, threshold 20%. After buying 1 (from 79 sold → 80 sold),
        // remaining = 20 = 20% — NOT below threshold yet (< not <=).
        // To trigger: 81 sold → remaining = 19 = 19% < 20%
        $swarm = $this->fakeSwarm([
            'comb_count'             => 100,
            'combs_sold'             => 80,
            'filling_fast_threshold' => 20,
            'region_id'              => 'ca',
            'status'                 => 'active',
        ]);

        // After buying 1 more: combs_sold = 81, remaining = 19, 19% < 20%
        $updatedSwarm = $this->fakeSwarm([
            'comb_count'             => 100,
            'combs_sold'             => 81,
            'filling_fast_threshold' => 20,
            'region_id'              => 'ca',
            'status'                 => 'active',
        ]);

        $swarmModel->method('findById')->willReturn($swarm);
        $userModel->method('findById')->willReturn($this->fakeUser(['home_region' => 'ca']));
        $combModel->method('countByUserAndSwarm')->willReturn(0);
        $combModel->method('getNextCombNumbers')->willReturn([81]);
        $combModel->method('insertBatch');
        $swarmModel->method('incrementCombsSold')->willReturn($updatedSwarm);

        // Expect transitionStatus called with 'filling_fast'
        $swarmModel->expects($this->once())
            ->method('transitionStatus')
            ->with(1, 'filling_fast');

        $walletService->method('deduct')->willReturn([
            'deducted_bonus'   => 0.00,
            'deducted_deposit' => 5.00,
        ]);
        $walletService->method('getBalance')->willReturn([
            'deposit_balance' => 95.00,
            'bonus_balance'   => 0.00,
            'total_balance'   => 95.00,
            'region_id'       => 'ca',
        ]);

        $result = $service->purchaseCombs(42, 1, 1);

        $this->assertFalse($result['swarm_filled']);
    }

    /**
     * Validation Criteria #7: swarm with 100 combs, member holds 5 → odds returned as 5.0 (percent).
     */
    public function testOddsCalculation(): void
    {
        [$service, $swarmModel, $userModel, $combModel] = $this->buildServiceWithMocks();

        $swarm = $this->fakeSwarm([
            'comb_count'  => 100,
            'combs_sold'  => 50,
            'region_id'   => 'ca',
        ]);

        $swarmModel->method('findById')->willReturn($swarm);
        $combModel->method('countByUserAndSwarm')->willReturn(5);

        $odds = $service->getOdds(1, 42);

        $this->assertSame(5.0, $odds['member_odds']);
        $this->assertSame(50, $odds['combs_remaining']);
    }
}
