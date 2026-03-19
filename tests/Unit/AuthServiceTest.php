<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use App\Services\AuthService;
use App\Exceptions\ValidationException;
use App\Exceptions\AuthException;

class AuthServiceTest extends TestCase
{
    private AuthService $authService;

    protected function setUp(): void
    {
        $this->authService = new AuthService();
    }

    public function testLoginThrowsValidationExceptionWhenEmailEmpty(): void
    {
        $this->expectException(ValidationException::class);
        $this->authService->login('', 'password');
    }

    public function testLoginThrowsValidationExceptionWhenPasswordEmpty(): void
    {
        $this->expectException(ValidationException::class);
        $this->authService->login('test@test.com', '');
    }

    public function testRegisterThrowsValidationExceptionForShortPassword(): void
    {
        $this->expectException(ValidationException::class);
        $this->authService->register([
            'name'     => 'Test User',
            'email'    => 'test@example.com',
            'password' => 'short',
        ]);
    }

    public function testRegisterThrowsValidationExceptionForInvalidEmail(): void
    {
        $this->expectException(ValidationException::class);
        $this->authService->register([
            'name'     => 'Test User',
            'email'    => 'not-an-email',
            'password' => 'validpassword123',
        ]);
    }

    public function testRefreshThrowsAuthExceptionForEmptyToken(): void
    {
        $this->expectException(AuthException::class);
        $this->authService->refresh('');
    }

    public function testRefreshThrowsAuthExceptionForInvalidToken(): void
    {
        $this->expectException(AuthException::class);
        $this->authService->refresh('invalid.token.here');
    }
}
