<?php

declare(strict_types=1);

namespace App\Config;

class Env
{
    private static bool $loaded = false;

    public static function load(): void
    {
        if (self::$loaded) {
            return;
        }

        $root = dirname(__DIR__, 2);

        self::loadFile($root . '/.env');

        $appEnv = $_ENV['APP_ENV'] ?? getenv('APP_ENV') ?? 'local';

        $override = match ($appEnv) {
            'production' => $root . '/.env.production',
            'staging'    => $root . '/.env.staging',
            default      => $root . '/.env.local',
        };

        if (file_exists($override)) {
            self::loadFile($override);
        }

        self::$loaded = true;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return $_ENV[$key] ?? getenv($key) ?: $default;
    }

    private static function loadFile(string $path): void
    {
        if (!file_exists($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        foreach ($lines as $line) {
            if (str_starts_with(trim($line), '#')) {
                continue;
            }

            if (!str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $key   = trim($key);
            $value = trim($value, " \t\n\r\0\x0B\"'");

            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $value;
                putenv("{$key}={$value}");
            }
        }
    }
}
