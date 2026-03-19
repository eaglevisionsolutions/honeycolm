<?php

declare(strict_types=1);

namespace App\Models;

class AdminStaffModel extends BaseModel
{
    protected string $table = 'admin_staff';

    public function findByEmail(string $email): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `admin_staff` WHERE `email` = ? LIMIT 1",
            [$email]
        );
    }

    public function emailExists(string $email): bool
    {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM `admin_staff` WHERE `email` = ? LIMIT 1"
        );
        $stmt->execute([$email]);

        return (bool) $stmt->fetchColumn();
    }

    public function updateLastLogin(int $id): bool
    {
        return $this->update($id, ['last_login_at' => date('Y-m-d H:i:s')]);
    }

    public function publicFields(array $staff): array
    {
        unset($staff['password_hash']);
        return $staff;
    }
}
