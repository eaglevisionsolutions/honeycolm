<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateWalletsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `wallets` (
                `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `user_id`         INT UNSIGNED NOT NULL,
                `region_id`       VARCHAR(10)  NOT NULL,
                `deposit_balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                `bonus_balance`   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_user_region` (`user_id`, `region_id`),
                CONSTRAINT `fk_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
                CONSTRAINT `fk_wallets_region` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: wallets\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `wallets`");
        echo "✓ Dropped table: wallets\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateWalletsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
