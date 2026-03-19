<?php

declare(strict_types=1);

namespace App\Middleware;

use PDO;
use App\Config\Database;

class RegionMiddleware
{
    public static ?string $region = null;

    private PDO $db;

    /** Set to true during testing to suppress header()/exit() side-effects. */
    public bool $testMode = false;

    /** Records the redirect URL when testMode is true instead of calling header(). */
    public ?string $redirectedTo = null;

    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?? Database::connection();
    }

    public function handle(): void
    {
        $uri  = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?? '/';

        if (str_starts_with($path, '/us/') || $path === '/us') {
            if ($this->isUsMarketActive()) {
                self::$region = 'us';
            } else {
                $this->redirect('/ca/');
            }
            return;
        }

        if (str_starts_with($path, '/ca/') || $path === '/ca') {
            self::$region = 'ca';
            return;
        }

        // Default to 'ca' when no region prefix is present
        self::$region = 'ca';
    }

    private function redirect(string $url): void
    {
        if ($this->testMode) {
            $this->redirectedTo = $url;
            return;
        }

        header('Location: ' . $url);
        exit;
    }

    private function isUsMarketActive(): bool
    {
        $stmt = $this->db->prepare(
            "SELECT `value` FROM `platform_settings` WHERE `key` = 'us_market_active' LIMIT 1"
        );
        $stmt->execute();
        $value = $stmt->fetchColumn();

        return $value === '1' || $value === 1;
    }
}
