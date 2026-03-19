<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreatePlatformSettingsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `platform_settings` (
                `key`        VARCHAR(100) NOT NULL,
                `value`      TEXT         NULL,
                `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        $this->db->exec("
            INSERT IGNORE INTO `platform_settings` (`key`, `value`) VALUES
                ('margin_warning_threshold', '15'),
                ('filling_fast_threshold',   '20'),
                ('random_org_api_key',        ''),
                ('us_market_active',          '0'),
                ('com_default_region',        'ca')
        ");

        echo "✓ Created table: platform_settings (seeded 5 rows)\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `platform_settings`");
        echo "✓ Dropped table: platform_settings\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreatePlatformSettingsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
