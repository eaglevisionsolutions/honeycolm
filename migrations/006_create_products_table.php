<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateProductsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `products` (
                `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `name`         VARCHAR(255) NOT NULL,
                `brand`        VARCHAR(100) NOT NULL,
                `category`     ENUM('Electronics','Fashion','Gaming','Experiences','Collectibles') NOT NULL,
                `retail_value` DECIMAL(12,2) NOT NULL,
                `description`  TEXT          NULL,
                `times_used`   INT UNSIGNED  NOT NULL DEFAULT 0,
                `is_active`    TINYINT(1)    NOT NULL DEFAULT 1,
                `created_by`   INT UNSIGNED  NULL DEFAULT NULL COMMENT 'admin_staff.id',
                `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_category` (`category`),
                INDEX `idx_name` (`name`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: products\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `products`");
        echo "✓ Dropped table: products\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateProductsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
