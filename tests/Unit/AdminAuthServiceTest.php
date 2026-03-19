<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use App\Services\AdminAuthService;
use App\Models\AdminStaffModel;
use App\Middleware\AdminAuthMiddleware;
use App\Exceptions\AuthException;
use App\Exceptions\ValidationException;
use App\Config\Env;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use stdClass;

class AdminAuthServiceTest extends TestCase
{
    private AdminStaffModel&MockObject $adminStaffModel;
    private AdminAuthService $adminAuthService;

    protected function setUp(): void
    {
        $this->adminStaffModel  = $this->createMock(AdminStaffModel::class);
        $this->adminAuthService = new AdminAuthService($this->adminStaffModel);
    }

    public function testLoginReturnsTokenForValidCredentials(): void
    {
        $passwordHash = password_hash('correct-password', PASSWORD_BCRYPT, ['cost' => 4]);

        $staffRow = [
            'id'            => 1,
            'name'          => 'Super Admin',
            'email'         => 'admin@example.com',
            'password_hash' => $passwordHash,
            'role'          => 'super_admin',
            'is_active'     => 1,
            'last_login_at' => null,
            'created_at'    => '2026-01-01 00:00:00',
            'updated_at'    => '2026-01-01 00:00:00',
        ];

        $this->adminStaffModel
            ->expects($this->once())
            ->method('findByEmail')
            ->with('admin@example.com')
            ->willReturn($staffRow);

        $this->adminStaffModel
            ->expects($this->once())
            ->method('updateLastLogin')
            ->with(1)
            ->willReturn(true);

        $publicStaff = $staffRow;
        unset($publicStaff['password_hash']);

        $this->adminStaffModel
            ->expects($this->once())
            ->method('publicFields')
            ->with($staffRow)
            ->willReturn($publicStaff);

        $result = $this->adminAuthService->login('admin@example.com', 'correct-password');

        $this->assertArrayHasKey('access_token', $result);
        $this->assertArrayHasKey('expires_in', $result);
        $this->assertArrayHasKey('staff', $result);
        $this->assertSame('super_admin', $result['staff']['role']);
        $this->assertArrayNotHasKey('password_hash', $result['staff']);

        // Verify the token payload contains admin_access type and correct role
        $secret  = Env::get('JWT_SECRET', '');
        $payload = JWT::decode($result['access_token'], new Key($secret, 'HS256'));
        $this->assertSame('admin_access', $payload->type);
        $this->assertSame('super_admin', $payload->role);
        $this->assertSame(1, $payload->sub);
    }

    public function testLoginFailsForDeactivatedStaff(): void
    {
        $passwordHash = password_hash('password', PASSWORD_BCRYPT, ['cost' => 4]);

        $staffRow = [
            'id'            => 2,
            'name'          => 'Inactive Staff',
            'email'         => 'inactive@example.com',
            'password_hash' => $passwordHash,
            'role'          => 'staff',
            'is_active'     => 0,
            'last_login_at' => null,
            'created_at'    => '2026-01-01 00:00:00',
            'updated_at'    => '2026-01-01 00:00:00',
        ];

        $this->adminStaffModel
            ->expects($this->once())
            ->method('findByEmail')
            ->with('inactive@example.com')
            ->willReturn($staffRow);

        $this->expectException(AuthException::class);
        $this->expectExceptionMessage('Account is deactivated.');

        $this->adminAuthService->login('inactive@example.com', 'password');
    }

    public function testLoginFailsWithValidationExceptionForEmptyEmail(): void
    {
        $this->expectException(ValidationException::class);
        $this->adminAuthService->login('', 'password');
    }

    public function testLoginFailsWithValidationExceptionForEmptyPassword(): void
    {
        $this->expectException(ValidationException::class);
        $this->adminAuthService->login('admin@example.com', '');
    }

    public function testLoginFailsForWrongPassword(): void
    {
        $passwordHash = password_hash('correct-password', PASSWORD_BCRYPT, ['cost' => 4]);

        $staffRow = [
            'id'            => 1,
            'name'          => 'Admin',
            'email'         => 'admin@example.com',
            'password_hash' => $passwordHash,
            'role'          => 'super_admin',
            'is_active'     => 1,
            'last_login_at' => null,
            'created_at'    => '2026-01-01 00:00:00',
            'updated_at'    => '2026-01-01 00:00:00',
        ];

        $this->adminStaffModel
            ->expects($this->once())
            ->method('findByEmail')
            ->willReturn($staffRow);

        $this->expectException(AuthException::class);
        $this->expectExceptionMessage('Invalid email or password.');

        $this->adminAuthService->login('admin@example.com', 'wrong-password');
    }

    public function testLoginFailsForMemberJWT(): void
    {
        // Build a member-type JWT (type='access', not 'admin_access')
        $secret  = Env::get('JWT_SECRET', 'test-secret');
        $payload = [
            'iss'  => 'http://localhost',
            'sub'  => 99,
            'type' => 'access',
            'iat'  => time(),
            'exp'  => time() + 3600,
        ];

        $memberToken = JWT::encode($payload, $secret, 'HS256');
        $decoded     = JWT::decode($memberToken, new Key($secret, 'HS256'));

        $middleware  = new AdminAuthMiddleware();
        $statusCode  = $middleware->validatePayload($decoded);

        $this->assertSame(403, $statusCode, 'AdminAuthMiddleware must reject member JWTs with 403');
    }

    public function testAdminTokenPayloadContainsRequiredClaims(): void
    {
        $staffRow = [
            'id'   => 5,
            'role' => 'admin',
        ];

        $secret  = Env::get('JWT_SECRET', '');
        $token   = $this->adminAuthService->generateAdminToken($staffRow);
        $payload = JWT::decode($token, new Key($secret, 'HS256'));

        $this->assertSame('admin_access', $payload->type);
        $this->assertSame('admin', $payload->role);
        $this->assertSame(5, $payload->sub);
        $this->assertObjectHasProperty('iss', $payload);
        $this->assertObjectHasProperty('iat', $payload);
        $this->assertObjectHasProperty('exp', $payload);
    }
}
