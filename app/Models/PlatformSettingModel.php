<?php

declare(strict_types=1);

namespace App\Models;

class PlatformSettingModel extends BaseModel
{
    protected string $table      = 'platform_settings';
    protected string $primaryKey = 'key';

    /**
     * Returns the value of a platform setting by key, or null if not found.
     */
    public function getValue(string $key): ?string
    {
        $row = $this->queryOne(
            "SELECT `value` FROM `platform_settings` WHERE `key` = ? LIMIT 1",
            [$key]
        );

        if ($row === false) {
            return null;
        }

        return $row['value'];
    }
}
