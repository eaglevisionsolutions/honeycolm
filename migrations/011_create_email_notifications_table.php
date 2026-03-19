<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateEmailNotificationsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `email_notifications` (
                `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `user_id`       INT UNSIGNED NOT NULL,
                `type`          ENUM('swarm_launch','filling_warning','win_confirmation','refund_notice','withdrawal_update') NOT NULL,
                `subject`       VARCHAR(255) NOT NULL,
                `body_html`     TEXT         NOT NULL,
                `sent_at`       DATETIME     NULL DEFAULT NULL,
                `failed_at`     DATETIME     NULL DEFAULT NULL,
                `error_message` TEXT         NULL DEFAULT NULL,
                `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_user_id` (`user_id`),
                INDEX `idx_sent` (`sent_at`),
                CONSTRAINT `fk_en_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: email_notifications\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `email_notifications`");
        echo "✓ Dropped table: email_notifications\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateEmailNotificationsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
