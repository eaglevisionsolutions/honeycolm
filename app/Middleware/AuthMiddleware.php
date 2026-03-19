<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Config\Env;
use App\Exceptions\AuthException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use stdClass;

class AuthMiddleware
{
    /** Populated by handle() so controllers can read the JWT payload. */
    public static ?\stdClass $payload = null;

    private string $secret;

    public function __construct()
    {
        $this->secret = Env::get('JWT_SECRET', '');
    }

    /**
     * Enforce auth for a route: decode the token, store payload in the static
     * property, and terminate with 401 JSON if the token is absent or invalid.
     */
    public function handle(): void
    {
        try {
            self::$payload = $this->requireAuth();
        } catch (AuthException $e) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
            exit;
        }
    }

    /**
     * Validate bearer token and return decoded payload.
     *
     * @throws AuthException
     */
    public function requireAuth(): stdClass
    {
        $token = $this->extractToken();

        try {
            $payload = JWT::decode($token, new Key($this->secret, 'HS256'));
        } catch (ExpiredException) {
            throw new AuthException('Token expired', 401);
        } catch (\Exception) {
            throw new AuthException('Invalid token', 401);
        }

        if (($payload->type ?? '') !== 'access') {
            throw new AuthException('Invalid token type', 401);
        }

        return $payload;
    }

    private function extractToken(): string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

        if (!str_starts_with($header, 'Bearer ')) {
            throw new AuthException('Authorization header missing or malformed', 401);
        }

        return substr($header, 7);
    }
}
