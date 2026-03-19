<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

class CreateDrawsTable extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS `draws` (
                `id`                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `swarm_id`                 INT UNSIGNED NOT NULL,
                `winner_user_id`           INT UNSIGNED NOT NULL,
                `winner_comb_id`           INT UNSIGNED NOT NULL,
                `random_org_request_id`    VARCHAR(255) NULL DEFAULT NULL,
                `random_org_verify_url`    VARCHAR(500) NULL DEFAULT NULL,
                `random_org_raw_response`  JSON         NULL DEFAULT NULL,
                `winning_number`           INT UNSIGNED NOT NULL,
                `drawn_at`                 DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `is_published`             TINYINT(1)   NOT NULL DEFAULT 0,
                `published_at`             DATETIME     NULL DEFAULT NULL,
                UNIQUE KEY `uq_draw_swarm` (`swarm_id`),
                CONSTRAINT `fk_draws_swarm` FOREIGN KEY (`swarm_id`) REFERENCES `swarms`(`id`),
                CONSTRAINT `fk_draws_winner` FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`),
                CONSTRAINT `fk_draws_comb` FOREIGN KEY (`winner_comb_id`) REFERENCES `combs`(`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        echo "✓ Created table: draws\n";
    }

    public function down(): void
    {
        $this->db->exec("DROP TABLE IF EXISTS `draws`");
        echo "✓ Dropped table: draws\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new CreateDrawsTable();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
