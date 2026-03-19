<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Env;

class CorsMiddleware
{
    public function handle(): void
    {
        $allowed = explode(',', Env::get('CORS_ORIGINS', '*'));
        $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';

        if (in_array('*', $allowed, true) || in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Max-Age: 86400');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
