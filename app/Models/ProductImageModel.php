<?php

declare(strict_types=1);

namespace App\Models;

use App\Exceptions\NotFoundException;

class ProductImageModel extends BaseModel
{
    protected string $table = 'product_images';

    /**
     * Returns all images for a product ordered by sort_order, then id.
     */
    public function findByProductId(int $productId): array
    {
        return $this->query(
            "SELECT * FROM `{$this->table}` WHERE `product_id` = ? ORDER BY `sort_order` ASC, `id` ASC",
            [$productId]
        );
    }

    /**
     * Deletes the physical file at file_path then removes the DB row.
     */
    public function deleteWithFile(int $id): bool
    {
        $stmt = $this->db->prepare(
            "SELECT `file_path` FROM `{$this->table}` WHERE `id` = ? LIMIT 1"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if ($row === false) {
            throw new NotFoundException("Product image #{$id} not found");
        }

        $fullPath = dirname(__DIR__, 2) . '/public/' . ltrim($row['file_path'], '/');
        if (file_exists($fullPath)) {
            @unlink($fullPath);
        }

        return $this->delete($id);
    }
}
