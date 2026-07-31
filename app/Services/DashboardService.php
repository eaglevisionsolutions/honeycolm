<?php

declare(strict_types=1);

namespace App\Services;

use App\Config\Database;
use PDO;

class DashboardService
{
    private PDO $db;

    public function __construct(?PDO $db = null)
    {
        $this->db = $db ?? Database::connection();
    }

    /**
     * Returns the full admin dashboard payload: stat cards, active Swarms
     * table, and a merged recent-activity feed.
     */
    public function getDashboard(): array
    {
        return [
            'stats'           => $this->getStats(),
            'active_swarms'   => $this->getActiveSwarms(),
            'recent_activity' => $this->getRecentActivity(),
        ];
    }

    private function getStats(): array
    {
        $totalMembers = (int) $this->db
            ->query("SELECT COUNT(*) FROM `users`")
            ->fetchColumn();

        $activeSwarms = (int) $this->db
            ->query("SELECT COUNT(*) FROM `swarms` WHERE `status` IN ('active','filling_fast')")
            ->fetchColumn();

        $nectarInCirculation = (float) $this->db
            ->query("SELECT COALESCE(SUM(`deposit_balance` + `bonus_balance`), 0) FROM `wallets`")
            ->fetchColumn();

        $pendingWithdrawals = (int) $this->db
            ->query("SELECT COUNT(*) FROM `withdrawal_requests` WHERE `status` = 'pending'")
            ->fetchColumn();

        return [
            'total_members'         => $totalMembers,
            'active_swarms'         => $activeSwarms,
            'nectar_in_circulation' => $nectarInCirculation,
            'pending_withdrawals'   => $pendingWithdrawals,
        ];
    }

    private function getActiveSwarms(): array
    {
        $stmt = $this->db->prepare(
            "SELECT s.`id`, s.`combs_sold`, s.`comb_count`, s.`deadline`, s.`status`,
                    p.`name` AS product_name
               FROM `swarms` s
               JOIN `products` p ON p.`id` = s.`product_id`
              WHERE s.`status` IN ('active','filling_fast')
              ORDER BY s.`deadline` ASC
              LIMIT 10"
        );
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Merges recent registrations, top-ups, and withdrawal requests into a
     * single newest-first feed. There is no dedicated activity log table, so
     * this synthesizes one from existing records.
     */
    private function getRecentActivity(): array
    {
        $registrations = $this->db->query(
            "SELECT `name`, `created_at`
               FROM `users`
              ORDER BY `created_at` DESC
              LIMIT 20"
        )->fetchAll();

        $topups = $this->db->query(
            "SELECT wt.`amount`, wt.`created_at`, u.`name`
               FROM `wallet_transactions` wt
               JOIN `wallets` w ON w.`id` = wt.`wallet_id`
               JOIN `users` u ON u.`id` = w.`user_id`
              WHERE wt.`type` = 'topup'
              ORDER BY wt.`created_at` DESC
              LIMIT 20"
        )->fetchAll();

        $withdrawals = $this->db->query(
            "SELECT wr.`amount`, wr.`created_at`, u.`name`
               FROM `withdrawal_requests` wr
               JOIN `users` u ON u.`id` = wr.`user_id`
              ORDER BY wr.`created_at` DESC
              LIMIT 20"
        )->fetchAll();

        $events = [];

        foreach ($registrations as $row) {
            $events[] = [
                'created_at'  => $row['created_at'],
                'description' => "{$row['name']} registered.",
            ];
        }

        foreach ($topups as $row) {
            $events[] = [
                'created_at'  => $row['created_at'],
                'description' => "{$row['name']} topped up " . number_format((float) $row['amount']) . ' Nt.',
            ];
        }

        foreach ($withdrawals as $row) {
            $events[] = [
                'created_at'  => $row['created_at'],
                'description' => "{$row['name']} requested a " . number_format((float) $row['amount']) . ' Nt withdrawal.',
            ];
        }

        usort($events, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));

        return array_slice($events, 0, 20);
    }
}
