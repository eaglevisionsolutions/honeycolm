<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateSwarmsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `swarms` (
                `id`                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `product_id`             INT UNSIGNED NOT NULL,
                `region_id`              VARCHAR(10)  NOT NULL,
                `title`                  VARCHAR(255) NOT NULL,
                `status`                 ENUM('draft','active','filling_fast','full','draw_complete','shipped','expired','cancelled') NOT NULL DEFAULT 'draft',
                `swarm_type`             ENUM('standard','queen') NOT NULL DEFAULT 'standard',
                `comb_count`             INT UNSIGNED NOT NULL COMMENT 'Total Combs in this Swarm',
                `combs_sold`             INT UNSIGNED NOT NULL DEFAULT 0,
                `comb_price`             DECIMAL(10,2) NOT NULL COMMENT 'Nectar per Comb',
                `total_pool_value`       DECIMAL(12,2) GENERATED ALWAYS AS (`comb_count` * `comb_price`) STORED,
                `per_member_comb_limit`  INT UNSIGNED NULL DEFAULT NULL,
                `filling_fast_threshold` TINYINT UNSIGNED NOT NULL DEFAULT 20 COMMENT 'Percent remaining that triggers filling_fast',
                `deadline`               DATETIME     NOT NULL,
                `drawn_at`               DATETIME     NULL DEFAULT NULL,
                `shipped_at`             DATETIME     NULL DEFAULT NULL,
                `published_at`           DATETIME     NULL DEFAULT NULL,
                `cancelled_at`           DATETIME     NULL DEFAULT NULL,
                `created_by`             INT UNSIGNED NULL DEFAULT NULL COMMENT 'admin_staff.id',
                `created_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_status` (`status`),
                INDEX `idx_region` (`region_id`),
                INDEX `idx_deadline` (`deadline`),
                CONSTRAINT `fk_swarms_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
                CONSTRAINT `fk_swarms_region` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: swarms\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `swarms`");
        echo "✓ Dropped table: swarms\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateSwarmsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
