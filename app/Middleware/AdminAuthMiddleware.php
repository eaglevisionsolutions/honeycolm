<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Env;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use stdClass;

class AdminAuthMiddleware
{
    public static ?stdClass $staff = null;

    private string $secret;

    public function __construct()
    {
        $this->secret = Env::get('JWT_SECRET', '');
    }

    public function handle(): void
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (!str_starts_with($header, 'Bearer ')) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Authorization header missing or malformed']);
            exit;
        }

        $token = substr($header, 7);

        try {
            $payload = JWT::decode($token, new Key($this->secret, 'HS256'));
        } catch (ExpiredException) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Token expired']);
            exit;
        } catch (\Exception) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid token']);
            exit;
        }

        if (($payload->type ?? '') !== 'admin_access') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Forbidden']);
            exit;
        }

        self::$staff = $payload;
    }

    /**
     * Validates whether a decoded JWT payload is an admin token.
     * Returns the HTTP status code that should be sent (200 = valid, 401, or 403).
     */
    public function validatePayload(stdClass $payload): int
    {
        if (($payload->type ?? '') !== 'admin_access') {
            return 403;
        }

        return 200;
    }
}
