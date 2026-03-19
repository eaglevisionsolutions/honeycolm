<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateRegionsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `regions` (
                `id`            VARCHAR(10)  NOT NULL,
                `name`          VARCHAR(100) NOT NULL,
                `currency_code` VARCHAR(5)   NOT NULL,
                `currency_peg`  VARCHAR(10)  NOT NULL COMMENT '1:1 label e.g. CAD',
                `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
                `is_default`    TINYINT(1)   NOT NULL DEFAULT 0,
                `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        $this->db->exec("
            INSERT IGNORE INTO `regions` (`id`, `name`, `currency_code`, `currency_peg`, `is_active`, `is_default`)
            VALUES ('ca', 'Canada', 'CAD', 'CAD', 1, 1),
                   ('us', 'United States', 'USD', 'USD', 0, 0)
        ");

        echo "✓ Created table: regions (seeded 2 rows)\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `regions`");
        echo "✓ Dropped table: regions\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateRegionsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
