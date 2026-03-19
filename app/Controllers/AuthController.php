<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\AuthService;

class AuthController extends BaseController
{
    private AuthService $authService;

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    public function login(): never
    {
        try {
            $body  = $this->body();
            $email = trim($body['email'] ?? '');
            $pass  = $body['password'] ?? '';

            $result = $this->authService->login($email, $pass);

            $this->success($result, 'Login successful');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function register(): never
    {
        try {
            $body = $this->body();

            $result = $this->authService->register([
                'name'        => trim($body['name'] ?? ''),
                'email'       => trim($body['email'] ?? ''),
                'password'    => $body['password'] ?? '',
                'home_region' => trim($body['home_region'] ?? ''),
            ]);

            $this->created($result, 'Registration successful');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function refresh(): never
    {
        try {
            $body  = $this->body();
            $token = $body['refresh_token'] ?? '';

            $result = $this->authService->refresh($token);

            $this->success($result, 'Token refreshed');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function logout(): never
    {
        $this->success([], 'Logged out.');
    }
}
