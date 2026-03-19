<?php

declare(strict_types=1);

namespace App\Models;

class RegionModel extends BaseModel
{
    protected string $table      = 'regions';
    protected string $primaryKey = 'id';

    public function findAllActive(): array
    {
        return $this->query(
            "SELECT * FROM `regions` WHERE `is_active` = 1"
        );
    }

    public function isActiveRegion(string $id): bool
    {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM `regions` WHERE `id` = ? AND `is_active` = 1 LIMIT 1"
        );
        $stmt->execute([$id]);

        return (bool) $stmt->fetchColumn();
    }
}
