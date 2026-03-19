<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Migration.php';

use Migrations\Migration;

/**
 * Adds a UNIQUE index on wallet_transactions.stripe_payment_id to enforce
 * idempotency at the database level. Without this, two concurrent webhook
 * deliveries for the same payment_intent could both pass the SELECT-based
 * idempotency check and double-credit a wallet.
 *
 * The index is partial (only non-NULL values are constrained) because most
 * transaction rows (spend, refund, bonus) have stripe_payment_id = NULL.
 */
class AddUniqueStripePaymentId extends Migration
{
    public function up(): void
    {
        $this->db->exec("
            CREATE UNIQUE INDEX `uq_stripe_payment_id`
            ON `wallet_transactions` (`stripe_payment_id`)
        ");

        echo "✓ Added UNIQUE index uq_stripe_payment_id on wallet_transactions.stripe_payment_id\n";
    }

    public function down(): void
    {
        $this->db->exec("
            DROP INDEX `uq_stripe_payment_id` ON `wallet_transactions`
        ");

        echo "✓ Dropped UNIQUE index uq_stripe_payment_id\n";
    }
}

// Run
$action = $argv[1] ?? 'up';
$migration = new AddUniqueStripePaymentId();

if ($action === 'down') {
    $migration->down();
} else {
    $migration->up();
}
