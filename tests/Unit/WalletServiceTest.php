<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\WalletService;
use App\Models\WalletModel;
use App\Models\WalletTransactionModel;
use App\Exceptions\ValidationException;
use App\Exceptions\NotFoundException;

class WalletServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Fake wallet row as WalletModel would return it. */
    private function fakeWallet(array $overrides = []): array
    {
        return array_merge([
            'id'              => 1,
            'user_id'         => 42,
            'region_id'       => 'ca',
            'deposit_balance' => '40.00',
            'bonus_balance'   => '10.00',
        ], $overrides);
    }

    /**
     * Build a WalletService with mocked dependencies.
     *
     * @return array{WalletService, MockObject&WalletModel, MockObject&WalletTransactionModel}
     */
    private function buildService(array $walletRows = []): array
    {
        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);

        // Default: findByUserId returns the given rows
        $walletModel->method('findByUserId')->willReturn($walletRows);

        // Default: record() always returns a fake id
        $txModel->method('record')->willReturn(1);

        $service = new WalletService($walletModel, $txModel);

        return [$service, $walletModel, $txModel];
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #2: testDeductBonusFirst
    // wallet has Nt 10 bonus + Nt 40 deposit, deduct Nt 15 → bonus=0, deposit=35
    // -------------------------------------------------------------------------

    public function testDeductBonusFirst(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '40.00', 'bonus_balance' => '10.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        // deductWithLock should be called with walletId=1, amount=15.0
        $walletModel->expects($this->once())
            ->method('deductWithLock')
            ->with(1, 15.0)
            ->willReturn([
                'deducted_bonus'        => 10.0,
                'deducted_deposit'      => 5.0,
                'bonus_balance_after'   => 0.0,
                'deposit_balance_after' => 35.0,
            ]);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->method('record')->willReturn(1);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->deduct(42, 15.0, 'swarm', 7);

        $this->assertSame(10.0, $result['deducted_bonus']);
        $this->assertSame(5.0,  $result['deducted_deposit']);
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #3: testDeductDepositOnly
    // wallet has Nt 0 bonus + Nt 40 deposit, deduct Nt 10 → deposit=30
    // -------------------------------------------------------------------------

    public function testDeductDepositOnly(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '40.00', 'bonus_balance' => '0.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        $walletModel->expects($this->once())
            ->method('deductWithLock')
            ->with(1, 10.0)
            ->willReturn([
                'deducted_bonus'        => 0.0,
                'deducted_deposit'      => 10.0,
                'bonus_balance_after'   => 0.0,
                'deposit_balance_after' => 30.0,
            ]);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->method('record')->willReturn(1);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->deduct(42, 10.0, 'swarm', 7);

        $this->assertSame(0.0,  $result['deducted_bonus']);
        $this->assertSame(10.0, $result['deducted_deposit']);
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #4: testDeductFailsWhenInsufficientFunds
    // wallet has Nt 5 total, deduct Nt 10 → throws ValidationException
    // -------------------------------------------------------------------------

    public function testDeductFailsWhenInsufficientFunds(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '3.00', 'bonus_balance' => '2.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        // deductWithLock itself throws the exception (the model owns the DB lock)
        $walletModel->method('deductWithLock')
            ->willThrowException(new ValidationException(['wallet' => 'Insufficient Nectar balance.']));

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);

        $service = new WalletService($walletModel, $txModel);

        $this->expectException(ValidationException::class);

        try {
            $service->deduct(42, 10.0, 'swarm', 7);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('wallet', $e->getErrors());
            $this->assertSame('Insufficient Nectar balance.', $e->getErrors()['wallet']);
            throw $e;
        }
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #5: testRefundToSourceBucket
    // refund of bonus amount goes to bonus; refund of deposit amount goes to deposit
    // -------------------------------------------------------------------------

    public function testRefundToSourceBucket(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '30.00', 'bonus_balance' => '0.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        // Expect creditDeposit called for deposit portion
        $walletModel->expects($this->once())
            ->method('creditDeposit')
            ->with(1, 5.0)
            ->willReturn(true);

        // Expect creditBonus called for bonus portion
        $walletModel->expects($this->once())
            ->method('creditBonus')
            ->with(1, 10.0)
            ->willReturn(true);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);

        // Two refund transaction rows should be recorded
        $txModel->expects($this->exactly(2))
            ->method('record')
            ->willReturn(1);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->refund(42, 5.0, 10.0, 'swarm', 7);

        $this->assertTrue($result);
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #6: testCreditDeposit
    // deposit_balance increases by exact amount
    // -------------------------------------------------------------------------

    public function testCreditDeposit(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '40.00', 'bonus_balance' => '10.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        $walletModel->expects($this->once())
            ->method('creditDeposit')
            ->with(1, 25.0)
            ->willReturn(true);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->expects($this->once())
            ->method('record')
            ->with($this->callback(function (array $row): bool {
                return $row['type']   === 'topup'
                    && $row['bucket'] === 'deposit'
                    && $row['amount'] === 25.0
                    && $row['balance_after'] === 65.0; // 40 + 25
            }))
            ->willReturn(1);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->creditDeposit(42, 25.0, 'pi_test_123');

        $this->assertTrue($result);
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #7: testCreditBonus
    // bonus_balance increases by exact amount
    // -------------------------------------------------------------------------

    public function testCreditBonus(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '40.00', 'bonus_balance' => '10.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        $walletModel->expects($this->once())
            ->method('creditBonus')
            ->with(1, 5.0)
            ->willReturn(true);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->expects($this->once())
            ->method('record')
            ->with($this->callback(function (array $row): bool {
                return $row['type']   === 'bonus'
                    && $row['bucket'] === 'bonus'
                    && $row['amount'] === 5.0
                    && $row['balance_after'] === 15.0; // 10 + 5
            }))
            ->willReturn(1);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->creditBonus(42, 5.0);

        $this->assertTrue($result);
    }

    // -------------------------------------------------------------------------
    // Validation Criteria #11: deduct() creates wallet_transactions rows
    // with correct bucket and balance_after values
    // -------------------------------------------------------------------------

    public function testDeductRecordsTransactionRows(): void
    {
        // Bonus 10 + Deposit 40; deduct 15 → bonus row (balance_after=0) + deposit row (balance_after=35)
        $wallet = $this->fakeWallet(['deposit_balance' => '40.00', 'bonus_balance' => '10.00']);

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);
        $walletModel->method('deductWithLock')->willReturn([
            'deducted_bonus'        => 10.0,
            'deducted_deposit'      => 5.0,
            'bonus_balance_after'   => 0.0,
            'deposit_balance_after' => 35.0,
        ]);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);

        $calls = [];
        $txModel->expects($this->exactly(2))
            ->method('record')
            ->willReturnCallback(function (array $row) use (&$calls): int {
                $calls[] = $row;
                return 1;
            });

        $service = new WalletService($walletModel, $txModel);
        $service->deduct(42, 15.0, 'swarm', 7);

        // First call must be the bonus row
        $this->assertSame('bonus',   $calls[0]['bucket']);
        $this->assertSame(10.0,      $calls[0]['amount']);
        $this->assertSame(0.0,       $calls[0]['balance_after']);
        $this->assertSame('spend',   $calls[0]['type']);

        // Second call must be the deposit row
        $this->assertSame('deposit', $calls[1]['bucket']);
        $this->assertSame(5.0,       $calls[1]['amount']);
        $this->assertSame(35.0,      $calls[1]['balance_after']);
        $this->assertSame('spend',   $calls[1]['type']);
    }

    // -------------------------------------------------------------------------
    // getBalance returns correct structure
    // -------------------------------------------------------------------------

    public function testGetBalanceReturnsCorrectStructure(): void
    {
        $wallet = $this->fakeWallet(['deposit_balance' => '100.00', 'bonus_balance' => '20.00']);

        [$service] = $this->buildService([$wallet]);

        $result = $service->getBalance(42);

        $this->assertSame(100.0, $result['deposit_balance']);
        $this->assertSame(20.0,  $result['bonus_balance']);
        $this->assertSame(120.0, $result['total_balance']);
        $this->assertSame('ca',  $result['region_id']);
    }

    // -------------------------------------------------------------------------
    // getBalance throws NotFoundException when user has no wallet
    // -------------------------------------------------------------------------

    public function testGetBalanceThrowsWhenNoWallet(): void
    {
        [$service] = $this->buildService([]);

        $this->expectException(NotFoundException::class);

        $service->getBalance(99);
    }

    // -------------------------------------------------------------------------
    // getTransactionHistory returns paginated structure
    // -------------------------------------------------------------------------

    public function testGetTransactionHistoryReturnsPaginatedStructure(): void
    {
        $wallet = $this->fakeWallet();

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->method('findByWalletId')
            ->with(1, 20, 0)
            ->willReturn([
                'rows'  => [['id' => 1, 'type' => 'topup', 'amount' => '50.00']],
                'total' => 1,
            ]);

        $service = new WalletService($walletModel, $txModel);
        $result  = $service->getTransactionHistory(42, 1, 20);

        $this->assertSame(1,  $result['total']);
        $this->assertSame(1,  $result['page']);
        $this->assertSame(20, $result['per_page']);
        $this->assertCount(1, $result['transactions']);
    }

    // -------------------------------------------------------------------------
    // Security: deduct rejects zero or negative amounts
    // -------------------------------------------------------------------------

    public function testDeductRejectsNegativeAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->deduct(42, -5.0, 'swarm', 7);
    }

    public function testDeductRejectsZeroAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->deduct(42, 0.0, 'swarm', 7);
    }

    // -------------------------------------------------------------------------
    // Security: creditDeposit rejects zero or negative amounts
    // -------------------------------------------------------------------------

    public function testCreditDepositRejectsNegativeAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->creditDeposit(42, -10.0, 'pi_test_neg');
    }

    public function testCreditDepositRejectsZeroAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->creditDeposit(42, 0.0, 'pi_test_zero');
    }

    // -------------------------------------------------------------------------
    // Security: creditBonus rejects zero or negative amounts
    // -------------------------------------------------------------------------

    public function testCreditBonusRejectsNegativeAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->creditBonus(42, -5.0);
    }

    public function testCreditBonusRejectsZeroAmount(): void
    {
        $wallet = $this->fakeWallet();
        [$service] = $this->buildService([$wallet]);

        $this->expectException(ValidationException::class);
        $service->creditBonus(42, 0.0);
    }

    // -------------------------------------------------------------------------
    // per_page is capped at 50
    // -------------------------------------------------------------------------

    public function testGetTransactionHistoryCapsPerPage(): void
    {
        $wallet = $this->fakeWallet();

        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        $walletModel->method('findByUserId')->willReturn([$wallet]);

        /** @var MockObject&WalletTransactionModel $txModel */
        $txModel = $this->createMock(WalletTransactionModel::class);
        $txModel->expects($this->once())
            ->method('findByWalletId')
            ->with(1, 50, 0) // capped to 50, not 100
            ->willReturn(['rows' => [], 'total' => 0]);

        $service = new WalletService($walletModel, $txModel);
        $service->getTransactionHistory(42, 1, 100);
    }
}
