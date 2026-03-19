<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\UserModel;
use App\Models\WalletModel;
use App\Models\RegionModel;
use App\Config\Env;
use App\Exceptions\AuthException;
use App\Exceptions\ValidationException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class AuthService
{
    private UserModel   $userModel;
    private WalletModel $walletModel;
    private RegionModel $regionModel;
    private string      $secret;
    private int         $expiry;
    private int         $refreshExpiry;

    public function __construct(
        ?UserModel   $userModel   = null,
        ?WalletModel $walletModel = null,
        ?RegionModel $regionModel = null,
    ) {
        $this->userModel     = $userModel   ?? new UserModel();
        $this->walletModel   = $walletModel ?? new WalletModel();
        $this->regionModel   = $regionModel ?? new RegionModel();
        $this->secret        = Env::get('JWT_SECRET', '');
        $this->expiry        = (int) Env::get('JWT_EXPIRY', 3600);
        $this->refreshExpiry = (int) Env::get('JWT_REFRESH_EXPIRY', 604800);
    }

    public function login(string $email, string $password): array
    {
        $errors = [];
        if (empty($email))    $errors['email']    = 'Email is required.';
        if (empty($password)) $errors['password'] = 'Password is required.';
        if ($errors) throw new ValidationException($errors);

        $user = $this->userModel->findByEmail($email);

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new AuthException('Invalid email or password.');
        }

        if (!($user['is_active'] ?? true)) {
            throw new AuthException('Account is deactivated.');
        }

        return [
            'access_token'  => $this->generateToken($user, 'access'),
            'refresh_token' => $this->generateToken($user, 'refresh'),
            'expires_in'    => $this->expiry,
            'user'          => $this->userModel->publicFields($user),
            'role'          => $user['role'],
            'region'        => $user['home_region'],
        ];
    }

    public function register(array $data): array
    {
        $errors = $this->validateRegistration($data);
        if ($errors) throw new ValidationException($errors);

        if ($this->userModel->emailExists($data['email'])) {
            throw new ValidationException(['email' => 'Email already registered.']);
        }

        $id = $this->userModel->insert([
            'name'          => $data['name'],
            'email'         => $data['email'],
            'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]),
            'home_region'   => $data['home_region'],
            'role'          => 'member',
            'is_active'     => 1,
        ]);

        $this->walletModel->createForUser($id, $data['home_region']);

        $user = $this->userModel->findById($id);

        return [
            'access_token'  => $this->generateToken($user, 'access'),
            'refresh_token' => $this->generateToken($user, 'refresh'),
            'expires_in'    => $this->expiry,
            'user'          => $this->userModel->publicFields($user),
            'role'          => $user['role'],
            'region'        => $user['home_region'],
        ];
    }

    public function refresh(string $refreshToken): array
    {
        if (empty($refreshToken)) {
            throw new AuthException('Refresh token required.');
        }

        try {
            $payload = JWT::decode($refreshToken, new Key($this->secret, 'HS256'));
        } catch (\Exception) {
            throw new AuthException('Invalid or expired refresh token.');
        }

        if (($payload->type ?? '') !== 'refresh') {
            throw new AuthException('Invalid token type.');
        }

        $user = $this->userModel->findById((int) $payload->sub);

        return [
            'access_token' => $this->generateToken($user, 'access'),
            'expires_in'   => $this->expiry,
        ];
    }

    private function generateToken(array $user, string $type): string
    {
        $expiry = $type === 'refresh' ? $this->refreshExpiry : $this->expiry;

        $payload = [
            'iss'    => Env::get('APP_URL', 'http://localhost'),
            'sub'    => $user['id'],
            'type'   => $type,
            'role'   => $user['role'] ?? 'member',
            'region' => $user['home_region'] ?? null,
            'iat'    => time(),
            'exp'    => time() + $expiry,
        ];

        return JWT::encode($payload, $this->secret, 'HS256');
    }

    private function validateRegistration(array $data): array
    {
        $errors = [];

        if (empty($data['name']))                         $errors['name']     = 'Name is required.';
        if (empty($data['email']))                        $errors['email']    = 'Email is required.';
        elseif (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email format.';
        if (empty($data['password']))                     $errors['password'] = 'Password is required.';
        elseif (strlen($data['password']) < 8)            $errors['password'] = 'Password must be at least 8 characters.';

        if (empty($data['home_region'])) {
            $errors['home_region'] = 'Home region is required.';
        } elseif (!$this->regionModel->isActiveRegion($data['home_region'])) {
            $errors['home_region'] = 'Region is not available.';
        }

        return $errors;
    }
}
