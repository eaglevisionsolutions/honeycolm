<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateWithdrawalRequestsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `withdrawal_requests` (
                `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `user_id`     INT UNSIGNED NOT NULL,
                `wallet_id`   INT UNSIGNED NOT NULL,
                `amount`      DECIMAL(12,2) NOT NULL,
                `status`      ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
                `notes`       TEXT         NULL DEFAULT NULL,
                `reviewed_by` INT UNSIGNED NULL DEFAULT NULL COMMENT 'admin_staff.id',
                `reviewed_at` DATETIME     NULL DEFAULT NULL,
                `paid_at`     DATETIME     NULL DEFAULT NULL,
                `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_user_id` (`user_id`),
                INDEX `idx_status` (`status`),
                CONSTRAINT `fk_wr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
                CONSTRAINT `fk_wr_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: withdrawal_requests\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `withdrawal_requests`");
        echo "✓ Dropped table: withdrawal_requests\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateWithdrawalRequestsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
