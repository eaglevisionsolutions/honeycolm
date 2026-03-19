<?php

declare(strict_types=1);

namespace App\Models;

use App\Exceptions\NotFoundException;

class DrawModel extends BaseModel
{
    protected string $table      = 'draws';
    protected string $primaryKey = 'id';

    /**
     * Returns the draw for a given swarm, or false if none exists.
     */
    public function findBySwarmId(int $swarmId): array|false
    {
        return $this->queryOne(
            "SELECT * FROM `draws` WHERE `swarm_id` = ? LIMIT 1",
            [$swarmId]
        );
    }

    /**
     * Returns true if a draw already exists for this swarm.
     */
    public function existsForSwarm(int $swarmId): bool
    {
        $stmt = $this->db->prepare(
            "SELECT 1 FROM `draws` WHERE `swarm_id` = ? LIMIT 1"
        );
        $stmt->execute([$swarmId]);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * Marks a draw as published.
     */
    public function markPublished(int $drawId): bool
    {
        $stmt = $this->db->prepare(
            "UPDATE `draws`
                SET `is_published` = 1,
                    `published_at` = NOW()
              WHERE `id` = ?"
        );
        $stmt->execute([$drawId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Returns all draws with swarm and product info for admin listing.
     */
    public function findAllWithSwarmInfo(): array
    {
        return $this->query(
            "SELECT d.*, s.`title` AS swarm_title, s.`status` AS swarm_status,
                    u.`name` AS winner_name, u.`email` AS winner_email
               FROM `draws` d
               JOIN `swarms` s ON s.`id` = d.`swarm_id`
               JOIN `users` u ON u.`id` = d.`winner_user_id`
              ORDER BY d.`drawn_at` DESC"
        );
    }

    /**
     * Returns a single draw with full swarm and winner info.
     *
     * @throws NotFoundException
     */
    public function findBySwarmIdWithDetails(int $swarmId): array
    {
        $row = $this->queryOne(
            "SELECT d.*, s.`title` AS swarm_title, s.`status` AS swarm_status,
                    s.`comb_count`, s.`comb_price`,
                    u.`name` AS winner_name, u.`email` AS winner_email
               FROM `draws` d
               JOIN `swarms` s ON s.`id` = d.`swarm_id`
               JOIN `users` u ON u.`id` = d.`winner_user_id`
              WHERE d.`swarm_id` = ?
              LIMIT 1",
            [$swarmId]
        );

        if ($row === false) {
            throw new NotFoundException("Draw for swarm #{$swarmId} not found");
        }

        return $row;
    }
}
