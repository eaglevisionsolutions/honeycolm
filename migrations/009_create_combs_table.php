<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateCombsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `combs` (
                `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `swarm_id`      INT UNSIGNED NOT NULL,
                `user_id`       INT UNSIGNED NOT NULL,
                `comb_number`   INT UNSIGNED NOT NULL COMMENT 'Sequential number within the swarm, 1-based',
                `bucket_source` ENUM('deposit','bonus') NOT NULL COMMENT 'Which bucket funded this Comb',
                `price_paid`    DECIMAL(10,2) NOT NULL,
                `refunded`      TINYINT(1) NOT NULL DEFAULT 0,
                `refunded_at`   DATETIME NULL DEFAULT NULL,
                `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_swarm_comb_number` (`swarm_id`, `comb_number`),
                INDEX `idx_user_swarm` (`user_id`, `swarm_id`),
                CONSTRAINT `fk_combs_swarm` FOREIGN KEY (`swarm_id`) REFERENCES `swarms`(`id`),
                CONSTRAINT `fk_combs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: combs\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `combs`");
        echo "✓ Dropped table: combs\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateCombsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
