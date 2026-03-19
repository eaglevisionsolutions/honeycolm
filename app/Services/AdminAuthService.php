<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AdminStaffModel;
use App\Config\Env;
use App\Exceptions\AuthException;
use App\Exceptions\ValidationException;
use Firebase\JWT\JWT;

class AdminAuthService
{
    private string $secret;
    private int    $expiry;

    public function __construct(
        private AdminStaffModel $adminStaffModel = new AdminStaffModel()
    ) {
        $this->secret = Env::get('JWT_SECRET', '');
        $this->expiry = (int) Env::get('JWT_EXPIRY', 3600);
    }

    public function login(string $email, string $password): array
    {
        $errors = [];
        if (empty($email))    $errors['email']    = 'Email is required.';
        if (empty($password)) $errors['password'] = 'Password is required.';
        if ($errors) throw new ValidationException($errors);

        $staff = $this->adminStaffModel->findByEmail($email);

        if (!$staff || !password_verify($password, $staff['password_hash'])) {
            throw new AuthException('Invalid email or password.');
        }

        if (!($staff['is_active'] ?? true)) {
            throw new AuthException('Account is deactivated.');
        }

        $this->adminStaffModel->updateLastLogin((int) $staff['id']);

        return [
            'access_token' => $this->generateAdminToken($staff),
            'expires_in'   => $this->expiry,
            'staff'        => $this->adminStaffModel->publicFields($staff),
        ];
    }

    public function generateAdminToken(array $staff): string
    {
        $payload = [
            'iss'  => Env::get('APP_URL', 'http://localhost'),
            'sub'  => $staff['id'],
            'type' => 'admin_access',
            'role' => $staff['role'],
            'iat'  => time(),
            'exp'  => time() + $this->expiry,
        ];

        return JWT::encode($payload, $this->secret, 'HS256');
    }
}
