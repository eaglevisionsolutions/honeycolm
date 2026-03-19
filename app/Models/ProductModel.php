<?php

declare(strict_types=1);

namespace App\Models;

class ProductModel extends BaseModel
{
    protected string $table = 'products';

    /**
     * Returns a single product with its images joined, ordered by sort_order.
     */
    public function findWithImages(int $id): array
    {
        $product = $this->findById($id);

        $images = $this->query(
            "SELECT id, product_id, file_path, sort_order, created_at
               FROM `product_images`
              WHERE product_id = ?
              ORDER BY sort_order ASC, id ASC",
            [$id]
        );

        $product['images'] = $images;

        return $product;
    }

    /**
     * Returns a paginated list of products with optional search and category filters.
     * Returns ['products' => [...], 'total' => N].
     */
    public function findAllPaginated(
        int    $page,
        int    $perPage,
        string $search   = '',
        string $category = ''
    ): array {
        $where  = [];
        $params = [];

        if ($search !== '') {
            $where[]  = '(`name` LIKE ? OR `brand` LIKE ?)';
            $params[] = '%' . $search . '%';
            $params[] = '%' . $search . '%';
        }

        if ($category !== '') {
            $where[]  = '`category` = ?';
            $params[] = $category;
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $countSql = "SELECT COUNT(*) FROM `{$this->table}` {$whereClause}";
        $stmt     = $this->db->prepare($countSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();

        $offset = ($page - 1) * $perPage;
        $dataSql = "SELECT * FROM `{$this->table}` {$whereClause}
                    ORDER BY `created_at` DESC
                    LIMIT ? OFFSET ?";

        $dataParams   = $params;
        $dataParams[] = $perPage;
        $dataParams[] = $offset;

        $stmt = $this->db->prepare($dataSql);
        $stmt->execute($dataParams);
        $products = $stmt->fetchAll();

        return ['products' => $products, 'total' => $total];
    }

    /**
     * Atomically increments the times_used counter for a product.
     */
    public function incrementTimesUsed(int $id): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `{$this->table}` SET `times_used` = `times_used` + 1 WHERE `id` = ?"
        );
        $stmt->execute([$id]);

        return $stmt->rowCount() > 0;
    }
}
