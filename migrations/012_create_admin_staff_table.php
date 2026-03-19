<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateAdminStaffTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `admin_staff` (
                `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `name`          VARCHAR(100) NOT NULL,
                `email`         VARCHAR(255) UNIQUE NOT NULL,
                `password_hash` VARCHAR(255) NOT NULL,
                `role`          ENUM('super_admin','admin','staff') NOT NULL DEFAULT 'staff',
                `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
                `last_login_at` DATETIME     NULL DEFAULT NULL,
                `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: admin_staff\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `admin_staff`");
        echo "✓ Dropped table: admin_staff\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateAdminStaffTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
