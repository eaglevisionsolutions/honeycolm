<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateProductImagesTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `product_images` (
                `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `product_id` INT UNSIGNED NOT NULL,
                `file_path`  VARCHAR(500) NOT NULL,
                `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_product_id` (`product_id`),
                CONSTRAINT `fk_pi_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: product_images\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `product_images`");
        echo "✓ Dropped table: product_images\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateProductImagesTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
