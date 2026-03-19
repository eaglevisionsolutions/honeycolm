<?php

declare(strict_types=1);

namespace Migrations;

use PDO;
use App\Config\Database;
use App\Config\Env;

abstract class Migration
{
    protected PDO $db;

    public function __construct()
    {
        Env::load();
        $this->db = Database::connection();
    }

    abstract public function up(): void;
    abstract public function down(): void;
}
