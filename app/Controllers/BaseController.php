<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Exceptions\ValidationException;
use App\Exceptions\AuthException;
use App\Exceptions\ForbiddenException;
use App\Exceptions\NotFoundException;
use App\Exceptions\DatabaseException;
use App\Config\Env;

abstract class BaseController
{
    final protected function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    final protected function success(mixed $data = null, string $message = 'OK', int $status = 200): never
    {
        $this->json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    final protected function created(mixed $data = null, string $message = 'Created'): never
    {
        $this->success($data, $message, 201);
    }

    final protected function noContent(): never
    {
        http_response_code(204);
        exit;
    }

    final protected function error(string $message, int $status = 400, array $errors = []): never
    {
        $body = ['success' => false, 'message' => $message];
        if (!empty($errors)) {
            $body['errors'] = $errors;
        }
        $this->json($body, $status);
    }

    final protected function body(): array
    {
        $raw = file_get_contents('php://input');
        return json_decode($raw, true) ?? [];
    }

    final protected function param(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    final protected function handleException(\Throwable $e): never
    {
        $debug = Env::get('APP_DEBUG', 'false') === 'true';

        match (true) {
            $e instanceof ValidationException => $this->error($e->getMessage(), 422, $e->getErrors()),
            $e instanceof AuthException       => $this->error($e->getMessage(), 401),
            $e instanceof ForbiddenException  => $this->error($e->getMessage(), 403),
            $e instanceof NotFoundException   => $this->error($e->getMessage(), 404),
            $e instanceof DatabaseException   => $this->error(
                $debug ? $e->getMessage() : 'A database error occurred.', 500
            ),
            default => $this->error(
                $debug ? $e->getMessage() : 'An unexpected error occurred.', 500
            ),
        };
    }
}
