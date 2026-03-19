<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class AlterUsersAddMemberColumns extends Migration
{
    public function up(): void
    {
        // MySQL 8.x does not support ADD COLUMN IF NOT EXISTS — check existence in PHP
        $existing = $this->getExistingColumns('users');

        $additions = [];

        if (!in_array('role', $existing, true)) {
            $additions[] = "ADD COLUMN `role` ENUM('member','admin') NOT NULL DEFAULT 'member' AFTER `email`";
        }
        if (!in_array('home_region', $existing, true)) {
            $additions[] = "ADD COLUMN `home_region` VARCHAR(10) NULL DEFAULT NULL AFTER `role`";
        }
        if (!in_array('email_verified', $existing, true)) {
            $additions[] = "ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `home_region`";
        }
        if (!in_array('phone', $existing, true)) {
            $additions[] = "ADD COLUMN `phone` VARCHAR(30) NULL DEFAULT NULL AFTER `email_verified`";
        }

        if (!empty($additions)) {
            $this->db->exec("ALTER TABLE `users` " . implode(', ', $additions));
        }

        echo "✓ Altered table: users (added role, home_region, email_verified, phone)\n";
    }

    public function down(): void
    {
        // MySQL 8.x does not support DROP COLUMN IF EXISTS — check existence in PHP
        $existing = $this->getExistingColumns('users');

        $drops = [];

        if (in_array('role', $existing, true)) {
            $drops[] = "DROP COLUMN `role`";
        }
        if (in_array('home_region', $existing, true)) {
            $drops[] = "DROP COLUMN `home_region`";
        }
        if (in_array('email_verified', $existing, true)) {
            $drops[] = "DROP COLUMN `email_verified`";
        }
        if (in_array('phone', $existing, true)) {
            $drops[] = "DROP COLUMN `phone`";
        }

        if (!empty($drops)) {
            $this->db->exec("ALTER TABLE `users` " . implode(', ', $drops));
        }

        echo "✓ Reverted table: users (dropped role, home_region, email_verified, phone)\n";
    }

    /** @return string[] */
    private function getExistingColumns(string $table): array
    {
        $stmt = $this->db->query("SHOW COLUMNS FROM `{$table}`");
        return array_column($stmt->fetchAll(\PDO::FETCH_ASSOC), 'Field');
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new AlterUsersAddMemberColumns();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
