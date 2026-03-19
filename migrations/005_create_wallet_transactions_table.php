<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateWalletTransactionsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `wallet_transactions` (
                `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `wallet_id`         INT UNSIGNED NOT NULL,
                `type`              ENUM('topup','spend','refund','withdrawal_request','withdrawal_complete','bonus') NOT NULL,
                `bucket`            ENUM('deposit','bonus') NOT NULL,
                `amount`            DECIMAL(12,2) NOT NULL COMMENT 'Always positive — direction implied by type',
                `balance_after`     DECIMAL(12,2) NOT NULL,
                `reference_type`    VARCHAR(50)  NULL DEFAULT NULL COMMENT 'swarm, stripe_payment, withdrawal',
                `reference_id`      INT UNSIGNED NULL DEFAULT NULL,
                `stripe_payment_id` VARCHAR(255) NULL DEFAULT NULL,
                `notes`             TEXT         NULL DEFAULT NULL,
                `created_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_wallet_id` (`wallet_id`),
                INDEX `idx_reference` (`reference_type`, `reference_id`),
                CONSTRAINT `fk_wt_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: wallet_transactions\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `wallet_transactions`");
        echo "✓ Dropped table: wallet_transactions\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateWalletTransactionsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
