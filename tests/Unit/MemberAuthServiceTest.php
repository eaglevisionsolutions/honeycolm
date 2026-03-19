<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\AuthService;
use App\Models\UserModel;
use App\Models\WalletModel;
use App\Models\RegionModel;
use App\Exceptions\ValidationException;

class MemberAuthServiceTest extends TestCase
{
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Build a fake user array that satisfies every code path in AuthService. */
    private function fakeUser(array $overrides = []): array
    {
        return array_merge([
            'id'            => 1,
            'name'          => 'Jane Bee',
            'email'         => 'jane@example.com',
            'password_hash' => password_hash('password123', PASSWORD_BCRYPT),
            'role'          => 'member',
            'home_region'   => 'ca',
            'is_active'     => 1,
        ], $overrides);
    }

    /**
     * Build an AuthService with the three models wired to mock objects.
     *
     * @return array{AuthService, MockObject&UserModel, MockObject&WalletModel, MockObject&RegionModel}
     */
    private function buildServiceWithMocks(): array
    {
        /** @var MockObject&UserModel $userModel */
        $userModel = $this->createMock(UserModel::class);
        /** @var MockObject&WalletModel $walletModel */
        $walletModel = $this->createMock(WalletModel::class);
        /** @var MockObject&RegionModel $regionModel */
        $regionModel = $this->createMock(RegionModel::class);

        $service = new AuthService($userModel, $walletModel, $regionModel);

        return [$service, $userModel, $walletModel, $regionModel];
    }

    // -------------------------------------------------------------------------
    // Registration — wallet creation
    // -------------------------------------------------------------------------

    public function testRegisterCreatesWalletForNewMember(): void
    {
        [$service, $userModel, $walletModel, $regionModel] = $this->buildServiceWithMocks();

        $regionModel->method('isActiveRegion')->with('ca')->willReturn(true);
        $userModel->method('emailExists')->willReturn(false);
        $userModel->method('insert')->willReturn(42);
        $userModel->method('findById')->with(42)->willReturn($this->fakeUser(['id' => 42]));
        $userModel->method('publicFields')->willReturnCallback(
            static function (array $user): array {
                unset($user['password_hash']);
                return $user;
            }
        );

        // The key assertion: createForUser must be called exactly once with the
        // correct user id and region id.
        $walletModel->expects($this->once())
            ->method('createForUser')
            ->with(42, 'ca')
            ->willReturn(1);

        $result = $service->register([
            'name'        => 'Jane Bee',
            'email'       => 'jane@example.com',
            'password'    => 'password123',
            'home_region' => 'ca',
        ]);

        $this->assertArrayHasKey('access_token', $result);
        $this->assertSame('member', $result['role']);
        $this->assertSame('ca', $result['region']);
    }

    // -------------------------------------------------------------------------
    // Registration — region validation
    // -------------------------------------------------------------------------

    public function testRegisterFailsWithInvalidRegion(): void
    {
        [$service, , , $regionModel] = $this->buildServiceWithMocks();

        // 'xx' is not a known region — isActiveRegion returns false.
        $regionModel->method('isActiveRegion')->with('xx')->willReturn(false);

        $this->expectException(ValidationException::class);

        try {
            $service->register([
                'name'        => 'Jane Bee',
                'email'       => 'jane@example.com',
                'password'    => 'password123',
                'home_region' => 'xx',
            ]);
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('home_region', $e->getErrors());
            throw $e;
        }
    }

    public function testRegisterFailsWithInactiveRegion(): void
    {
        [$service, , , $regionModel] = $this->buildServiceWithMocks();

        // Simulate 'us' being inactive (is_active = 0).
        $regionModel->method('isActiveRegion')->with('us')->willReturn(false);

        $this->expectException(ValidationException::class);

        try {
            $service->register([
                'name'        => 'John Bee',
                'email'       => 'john@example.com',
                'password'    => 'password123',
                'home_region' => 'us',
            ]);
        } catch (ValidationException $e) {
            $errors = $e->getErrors();
            $this->assertArrayHasKey('home_region', $errors);
            $this->assertSame('Region is not available.', $errors['home_region']);
            throw $e;
        }
    }

    public function testRegisterFailsWhenHomeRegionMissing(): void
    {
        [$service] = $this->buildServiceWithMocks();

        $this->expectException(ValidationException::class);

        try {
            $service->register([
                'name'     => 'Jane Bee',
                'email'    => 'jane@example.com',
                'password' => 'password123',
                // home_region intentionally omitted
            ]);
        } catch (ValidationException $e) {
            $errors = $e->getErrors();
            $this->assertArrayHasKey('home_region', $errors);
            $this->assertSame('Home region is required.', $errors['home_region']);
            throw $e;
        }
    }

    // -------------------------------------------------------------------------
    // Login — role and region in response
    // -------------------------------------------------------------------------

    public function testLoginReturnsRoleAndRegion(): void
    {
        [$service, $userModel] = $this->buildServiceWithMocks();

        $fakeUser = $this->fakeUser();

        $userModel->method('findByEmail')->with($fakeUser['email'])->willReturn($fakeUser);
        $userModel->method('publicFields')->willReturnCallback(
            static function (array $user): array {
                unset($user['password_hash']);
                return $user;
            }
        );

        $result = $service->login($fakeUser['email'], 'password123');

        $this->assertArrayHasKey('role', $result);
        $this->assertArrayHasKey('region', $result);
        $this->assertSame('member', $result['role']);
        $this->assertSame('ca', $result['region']);
    }
}
