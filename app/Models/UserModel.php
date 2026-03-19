<?php

declare(strict_types=1);

namespace App\Models;

use App\Exceptions\NotFoundException;

class UserModel extends BaseModel
{
    protected string $table = 'users';

    public function findByEmail(string $email): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `users` WHERE `email` = ? LIMIT 1",
            [$email]
        );
    }

    public function emailExists(string $email): bool
    {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM `users` WHERE `email` = ? LIMIT 1"
        );
        $stmt->execute([$email]);

        return (bool) $stmt->fetchColumn();
    }

    public function updatePassword(int $id, string $hashedPassword): bool
    {
        return $this->update($id, ['password_hash' => $hashedPassword]);
    }

    public function deactivate(int $id): bool
    {
        return $this->update($id, ['is_active' => 0]);
    }

    public function publicFields(array $user): array
    {
        unset($user['password_hash']);
        return $user;
    }

    public function findByRegion(string $region): array
    {
        return $this->query(
            "SELECT * FROM `users` WHERE `home_region` = ?",
            [$region]
        );
    }

    public function updateLastLogin(int $id): bool
    {
        return $this->update($id, ['updated_at' => date('Y-m-d H:i:s')]);
    }
}
