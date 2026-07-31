<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\WithdrawalRequestModel;
use App\Config\Database;
use PDO;

class FinanceService
{
    private PDO $db;

    public function __construct(
        private WithdrawalRequestModel $withdrawalModel = new WithdrawalRequestModel(),
        ?PDO                            $db              = null,
    ) {
        $this->db = $db ?? Database::connection();
    }

    public function getFinanceOverview(): array
    {
        return [
            'summary'                 => $this->getSummary(),
            'tier_breakdown'          => $this->getTierBreakdown(),
            'monthly_revenue'         => $this->getMonthlyRevenue(),
            'recent_paid_withdrawals' => $this->withdrawalModel->findRecentPaidWithMember(10),
        ];
    }

    /**
     * The Nectar ledger (wallet_transactions) does not track a separate CAD
     * amount or purchase tier, so this summary is expressed in Nectar only.
     * net_platform_margin_nt is a simplified figure: revenue in less
     * withdrawals paid out.
     */
    private function getSummary(): array
    {
        $totalTopupRevenue = (float) $this->db
            ->query("SELECT COALESCE(SUM(`amount`), 0) FROM `wallet_transactions` WHERE `type` = 'topup'")
            ->fetchColumn();

        $totalWithdrawalsPaid = (float) $this->db
            ->query("SELECT COALESCE(SUM(`amount`), 0) FROM `withdrawal_requests` WHERE `status` = 'paid'")
            ->fetchColumn();

        $totalBonusIssued = (float) $this->db
            ->query("SELECT COALESCE(SUM(`amount`), 0) FROM `wallet_transactions` WHERE `type` = 'bonus'")
            ->fetchColumn();

        return [
            'total_topup_revenue_nt'    => $totalTopupRevenue,
            'total_withdrawals_paid_nt' => $totalWithdrawalsPaid,
            'total_bonus_issued_nt'     => $totalBonusIssued,
            'net_platform_margin_nt'    => $totalTopupRevenue - $totalWithdrawalsPaid,
        ];
    }

    /**
     * Groups top-up transactions by Nectar amount, used as a proxy for
     * purchase tier since tier/CAD amount isn't stored on the ledger row.
     */
    private function getTierBreakdown(): array
    {
        $stmt = $this->db->query(
            "SELECT `amount` AS `tier`, COUNT(*) AS `count`, SUM(`amount`) AS `total_nt`
               FROM `wallet_transactions`
              WHERE `type` = 'topup'
              GROUP BY `amount`
              ORDER BY `amount` ASC"
        );

        return $stmt->fetchAll();
    }

    private function getMonthlyRevenue(): array
    {
        $stmt = $this->db->query(
            "SELECT DATE_FORMAT(`created_at`, '%Y-%m') AS `month`,
                    DATE_FORMAT(`created_at`, '%b %Y') AS `month_label`,
                    SUM(`amount`) AS `revenue_nt`
               FROM `wallet_transactions`
              WHERE `type` = 'topup'
              GROUP BY `month`, `month_label`
              ORDER BY `month` ASC"
        );

        $rows = $stmt->fetchAll();

        return array_slice($rows, -6);
    }
}
