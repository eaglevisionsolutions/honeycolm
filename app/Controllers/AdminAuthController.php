<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\AdminAuthService;

class AdminAuthController extends BaseController
{
    private AdminAuthService $adminAuthService;

    public function __construct()
    {
        $this->adminAuthService = new AdminAuthService();
    }

    public function login(): never
    {
        try {
            $body   = $this->body();
            $email  = trim($body['email'] ?? '');
            $pass   = $body['password'] ?? '';
            $result = $this->adminAuthService->login($email, $pass);
            $this->success($result, 'Login successful');
        } catch (\Throwable $e) {
            $this->handleException($e);
        }
    }

    public function logout(): never
    {
        $this->success([], 'Logged out.');
    }
}
