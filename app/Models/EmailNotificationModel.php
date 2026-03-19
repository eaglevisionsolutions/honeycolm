<?php

declare(strict_types=1);

namespace App\Models;

class EmailNotificationModel extends BaseModel
{
    protected string $table      = 'email_notifications';
    protected string $primaryKey = 'id';

    /**
     * Override insert to avoid adding updated_at (column doesn't exist on this table).
     */
    public function insert(array $data): int
    {
        if (!isset($data['created_at'])) {
            $data['created_at'] = date('Y-m-d H:i:s');
        }

        $columns      = array_map(fn($col) => "`{$col}`", array_keys($data));
        $placeholders = array_fill(0, count($data), '?');

        $sql = sprintf(
            "INSERT INTO `%s` (%s) VALUES (%s)",
            $this->table,
            implode(', ', $columns),
            implode(', ', $placeholders)
        );

        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_values($data));

        return (int) $this->db->lastInsertId();
    }

    /**
     * Returns pending (unsent, unfailed) notifications joined with user email.
     */
    public function findPending(int $limit = 50): array
    {
        return $this->query(
            "SELECT en.*, u.`email` AS user_email, u.`name` AS user_name
               FROM `email_notifications` en
               JOIN `users` u ON u.`id` = en.`user_id`
              WHERE en.`sent_at` IS NULL
                AND en.`failed_at` IS NULL
              ORDER BY en.`created_at` ASC
              LIMIT ?",
            [$limit]
        );
    }

    /**
     * Marks a notification as sent.
     */
    public function markSent(int $id): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `email_notifications` SET `sent_at` = NOW() WHERE `id` = ?"
        );
        $stmt->execute([$id]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Marks a notification as failed with an error message.
     */
    public function markFailed(int $id, string $error): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `email_notifications`
                SET `failed_at` = NOW(),
                    `error_message` = ?
              WHERE `id` = ?"
        );
        $stmt->execute([$error, $id]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Returns paginated notifications with optional filters.
     *
     * @return array{notifications: array, total: int}
     */
    public function findPaginated(array $filters, int $page, int $perPage): array
    {
        $where  = [];
        $params = [];

        if (!empty($filters['status'])) {
            match ($filters['status']) {
                'pending' => $where[] = 'en.`sent_at` IS NULL AND en.`failed_at` IS NULL',
                'sent'    => $where[] = 'en.`sent_at` IS NOT NULL',
                'failed'  => $where[] = 'en.`failed_at` IS NOT NULL',
                default   => null,
            };
        }

        if (!empty($filters['type'])) {
            $where[]  = 'en.`type` = ?';
            $params[] = $filters['type'];
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $offset      = ($page - 1) * $perPage;

        $countSql = "SELECT COUNT(*) FROM `email_notifications` en {$whereClause}";
        $countStmt = $this->db->prepare($countSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sql = "SELECT en.*, u.`email` AS user_email, u.`name` AS user_name
                  FROM `email_notifications` en
                  JOIN `users` u ON u.`id` = en.`user_id`
                  {$whereClause}
                  ORDER BY en.`created_at` DESC
                  LIMIT {$perPage} OFFSET {$offset}";

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);

        return [
            'notifications' => $stmt->fetchAll(),
            'total'         => $total,
        ];
    }
}
