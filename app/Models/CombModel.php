<?php

declare(strict_types=1);

namespace App\Models;

class CombModel extends BaseModel
{
    protected string $table      = 'combs';
    protected string $primaryKey = 'id';

    /**
     * Returns the number of Combs a user holds in a given Swarm.
     */
    public function countByUserAndSwarm(int $userId, int $swarmId): int
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM `combs` WHERE `user_id` = ? AND `swarm_id` = ?"
        );
        $stmt->execute([$userId, $swarmId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Returns the next N sequential comb_number values for a swarm.
     * Thread-safety note: this is called inside a transaction that has already
     * locked the swarm row via incrementCombsSold — so the max comb_number
     * is stable for the duration of this transaction.
     *
     * @return int[]
     */
    public function getNextCombNumbers(int $swarmId, int $quantity): array
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(MAX(`comb_number`), 0) FROM `combs` WHERE `swarm_id` = ?"
        );
        $stmt->execute([$swarmId]);
        $max = (int) $stmt->fetchColumn();

        $numbers = [];
        for ($i = 1; $i <= $quantity; $i++) {
            $numbers[] = $max + $i;
        }

        return $numbers;
    }

    /**
     * Bulk-inserts multiple comb rows in a single statement.
     *
     * @param array<int, array{swarm_id: int, user_id: int, comb_number: int, bucket_source: string, price_paid: float}> $combs
     */
    public function insertBatch(array $combs): void
    {
        if (empty($combs)) {
            return;
        }

        $now          = date('Y-m-d H:i:s');
        $valueClauses = [];
        $params       = [];

        foreach ($combs as $comb) {
            $valueClauses[] = "(?, ?, ?, ?, ?, ?)";
            $params[]       = $comb['swarm_id'];
            $params[]       = $comb['user_id'];
            $params[]       = $comb['comb_number'];
            $params[]       = $comb['bucket_source'];
            $params[]       = $comb['price_paid'];
            $params[]       = $now;
        }

        $sql = "INSERT INTO `combs`
                    (`swarm_id`, `user_id`, `comb_number`, `bucket_source`, `price_paid`, `created_at`)
                VALUES " . implode(', ', $valueClauses);

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
    }

    /**
     * Returns all combs for a swarm, joined with user name.
     */
    public function findBySwarm(int $swarmId): array
    {
        return $this->query(
            "SELECT c.*, u.`name` AS user_name
               FROM `combs` c
               JOIN `users` u ON u.`id` = c.`user_id`
              WHERE c.`swarm_id` = ?
              ORDER BY c.`comb_number` ASC",
            [$swarmId]
        );
    }

    /**
     * Returns only un-refunded combs for a swarm, joined with user name.
     * Used by RefundService to prevent double-refund.
     */
    public function findUnrefundedBySwarm(int $swarmId): array
    {
        return $this->query(
            "SELECT c.*, u.`name` AS user_name
               FROM `combs` c
               JOIN `users` u ON u.`id` = c.`user_id`
              WHERE c.`swarm_id` = ?
                AND c.`refunded` = 0
              ORDER BY c.`comb_number` ASC",
            [$swarmId]
        );
    }

    /**
     * Returns combs held by a specific user in a specific swarm.
     */
    public function findByUserAndSwarm(int $userId, int $swarmId): array
    {
        return $this->query(
            "SELECT * FROM `combs` WHERE `user_id` = ? AND `swarm_id` = ? ORDER BY `comb_number` ASC",
            [$userId, $swarmId]
        );
    }

    /**
     * Returns all swarms a user has entered, with combs held and swarm details.
     */
    public function findSwarmsByUser(int $userId): array
    {
        return $this->query(
            "SELECT s.`id`, s.`title`, s.`status`, s.`comb_count`, s.`combs_sold`,
                    s.`comb_price`, s.`deadline`,
                    p.`name` AS product_name, p.`retail_value`,
                    (SELECT pi.`image_url` FROM `product_images` pi WHERE pi.`product_id` = p.`id` ORDER BY pi.`sort_order` ASC, pi.`id` ASC LIMIT 1) AS primary_image,
                    COUNT(c.`id`) AS combs_held,
                    SUM(c.`price_paid`) AS total_spent
               FROM `combs` c
               JOIN `swarms` s ON s.`id` = c.`swarm_id`
               JOIN `products` p ON p.`id` = s.`product_id`
              WHERE c.`user_id` = ?
                AND c.`refunded` = 0
              GROUP BY s.`id`
              ORDER BY s.`deadline` DESC",
            [$userId]
        );
    }

    /**
     * Returns the winning comb for a swarm by comb_number.
     */
    public function getWinnerComb(int $swarmId, int $combNumber): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `combs` WHERE `swarm_id` = ? AND `comb_number` = ? LIMIT 1",
            [$swarmId, $combNumber]
        );
    }

    /**
     * Marks all combs in a swarm as refunded.
     */
    public function markRefundedBySwarm(int $swarmId): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `combs`
                SET `refunded` = 1,
                    `refunded_at` = NOW()
              WHERE `swarm_id` = ?
                AND `refunded` = 0"
        );
        $stmt->execute([$swarmId]);

        return $stmt->rowCount() > 0;
    }
}
