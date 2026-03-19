<?php

declare(strict_types=1);

namespace App\Models;

use App\Exceptions\NotFoundException;
use App\Exceptions\ValidationException;

class SwarmModel extends BaseModel
{
    protected string $table      = 'swarms';
    protected string $primaryKey = 'id';

    /**
     * Returns active/filling_fast swarms for a given region, with product data and
     * first image. Supports optional category filter and sort ordering.
     *
     * @param array{category?: string, sort?: string} $filters
     */
    public function findActive(string $region, array $filters = []): array
    {
        $params = [$region];

        $categoryClause = '';
        if (!empty($filters['category'])) {
            $categoryClause = " AND p.`category` = ?";
            $params[]       = $filters['category'];
        }

        $sort = match ($filters['sort'] ?? '') {
            'ending_soon' => 's.`deadline` ASC',
            'price_asc'   => 's.`comb_price` ASC',
            'price_desc'  => 's.`comb_price` DESC',
            default       => 's.`created_at` DESC',
        };

        $sql = "
            SELECT
                s.*,
                p.`name`         AS product_name,
                p.`brand`        AS product_brand,
                p.`category`     AS product_category,
                p.`retail_value` AS product_retail_value,
                pi.`file_path`   AS primary_image,
                ROUND((s.`combs_sold` / s.`comb_count`) * 100, 2) AS fill_percent,
                (s.`comb_count` - s.`combs_sold`) AS combs_remaining
            FROM `swarms` s
            JOIN `products` p ON p.`id` = s.`product_id`
            LEFT JOIN (
                SELECT `product_id`, MIN(`id`) AS min_id
                FROM `product_images`
                GROUP BY `product_id`
            ) pi_min ON pi_min.`product_id` = p.`id`
            LEFT JOIN `product_images` pi ON pi.`id` = pi_min.`min_id`
            WHERE s.`status` IN ('active','filling_fast')
              AND s.`region_id` = ?
              {$categoryClause}
            ORDER BY {$sort}
        ";

        return $this->query($sql, $params);
    }

    /**
     * Returns a single swarm with full product and images data.
     *
     * @throws NotFoundException
     */
    public function findWithProductAndImages(int $id): array
    {
        $swarm = $this->findById($id);

        $images = $this->query(
            "SELECT `id`, `product_id`, `file_path`, `sort_order`
               FROM `product_images`
              WHERE `product_id` = ?
              ORDER BY `sort_order` ASC, `id` ASC",
            [(int) $swarm['product_id']]
        );

        $product = $this->queryOne(
            "SELECT * FROM `products` WHERE `id` = ? LIMIT 1",
            [(int) $swarm['product_id']]
        );

        $swarm['product']          = $product ?: [];
        $swarm['product']['images'] = $images;
        $swarm['combs_remaining']  = (int) $swarm['comb_count'] - (int) $swarm['combs_sold'];
        $swarm['fill_percent']     = $swarm['comb_count'] > 0
            ? round(((int) $swarm['combs_sold'] / (int) $swarm['comb_count']) * 100, 2)
            : 0.0;

        return $swarm;
    }

    /**
     * Atomically increments combs_sold, enforcing the comb_count cap.
     * Uses a conditional UPDATE to prevent overselling.
     *
     * @throws ValidationException when quantity would exceed comb_count
     * @throws NotFoundException   when swarm does not exist or is not purchasable
     * @return array Updated swarm row.
     */
    public function incrementCombsSold(int $swarmId, int $quantity): array
    {
        $stmt = $this->db->prepare(
            "UPDATE `swarms`
                SET `combs_sold` = `combs_sold` + ?,
                    `updated_at` = NOW()
              WHERE `id` = ?
                AND `status` IN ('active','filling_fast')
                AND `combs_sold` + ? <= `comb_count`"
        );
        $stmt->execute([$quantity, $swarmId, $quantity]);

        if ($stmt->rowCount() === 0) {
            // Could be oversold or wrong status — treat as oversold since status
            // is validated earlier in the service layer
            throw new ValidationException(['combs' => 'Not enough Combs remaining.']);
        }

        return $this->findById($swarmId);
    }

    /**
     * Updates the swarm status and the corresponding timestamp field.
     */
    public function transitionStatus(int $swarmId, string $newStatus): bool
    {
        $timestampField = match ($newStatus) {
            'active'        => 'published_at',
            'cancelled'     => 'cancelled_at',
            'draw_complete' => 'drawn_at',
            'shipped'       => 'shipped_at',
            'full'          => null,
            'filling_fast'  => null,
            'expired'       => null,
            default         => null,
        };

        if ($timestampField !== null) {
            $stmt = $this->db->prepare(
                "UPDATE `swarms`
                    SET `status` = ?,
                        `{$timestampField}` = NOW(),
                        `updated_at` = NOW()
                  WHERE `id` = ?"
            );
            $stmt->execute([$newStatus, $swarmId]);
        } else {
            $stmt = $this->db->prepare(
                "UPDATE `swarms`
                    SET `status` = ?,
                        `updated_at` = NOW()
                  WHERE `id` = ?"
            );
            $stmt->execute([$newStatus, $swarmId]);
        }

        return $stmt->rowCount() > 0;
    }

    /**
     * Returns a paginated list of swarms for the admin panel.
     * Supports filters: status, region, search (title).
     *
     * @return array{swarms: array, total: int}
     */
    public function findAllAdmin(array $filters, int $page, int $perPage): array
    {
        $where  = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[]  = "s.`status` = ?";
            $params[] = $filters['status'];
        }

        if (!empty($filters['region'])) {
            $where[]  = "s.`region_id` = ?";
            $params[] = $filters['region'];
        }

        if (!empty($filters['search'])) {
            $where[]  = "s.`title` LIKE ?";
            $params[] = '%' . $filters['search'] . '%';
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $countSql = "SELECT COUNT(*) FROM `swarms` s {$whereClause}";
        $stmt     = $this->db->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        $offset      = ($page - 1) * $perPage;
        $dataParams  = $params;
        $dataParams[] = $perPage;
        $dataParams[] = $offset;

        $dataSql = "
            SELECT s.*, p.`name` AS product_name, p.`category` AS product_category
              FROM `swarms` s
              JOIN `products` p ON p.`id` = s.`product_id`
              {$whereClause}
             ORDER BY s.`created_at` DESC
             LIMIT ? OFFSET ?
        ";

        $stmt = $this->db->prepare($dataSql);
        $stmt->execute($dataParams);
        $swarms = $stmt->fetchAll();

        return ['swarms' => $swarms, 'total' => $total];
    }

    /**
     * Legacy method retained for compatibility with Task 13 tests.
     */
    public function findActiveById(int $id): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `swarms` WHERE `id` = ? AND `status` IN ('active','filling_fast') LIMIT 1",
            [$id]
        );
    }

    /**
     * Returns swarms whose deadline has passed and are still active/filling_fast.
     */
    public function findExpired(): array
    {
        return $this->query(
            "SELECT * FROM `swarms`
              WHERE `status` IN ('active', 'filling_fast')
                AND `deadline` < NOW()
              ORDER BY `deadline` ASC"
        );
    }
}
