<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateUsersTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `users` (
                `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `name`          VARCHAR(100)        NOT NULL,
                `email`         VARCHAR(255) UNIQUE NOT NULL,
                `password_hash` VARCHAR(255)        NOT NULL,
                `is_active`     TINYINT(1)          NOT NULL DEFAULT 1,
                `created_at`    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: users\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `users`");
        echo "✓ Dropped table: users\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateUsersTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
