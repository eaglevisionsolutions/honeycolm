<?php

declare(strict_types=1);

namespace App\Config;

use PDO;
use PDOException;
use App\Exceptions\DatabaseException;

class Database
{
    private static ?PDO $connection = null;

    public static function connection(): PDO
    {
        if (self::$connection === null) {
            self::$connection = self::createConnection();
        }

        return self::$connection;
    }

    private static function createConnection(): PDO
    {
        Env::load();

        $host    = Env::get('DB_HOST', 'localhost');
        $port    = Env::get('DB_PORT', '3306');
        $dbname  = Env::get('DB_DATABASE', '');
        $user    = Env::get('DB_USERNAME', 'root');
        $pass    = Env::get('DB_PASSWORD', '');
        $charset = 'utf8mb4';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        try {
            return new PDO($dsn, $user, $pass, $options);
        } catch (PDOException $e) {
            throw new DatabaseException('Database connection failed: ' . $e->getMessage(), 500, $e);
        }
    }

    /** Prevent instantiation */
    private function __construct() {}
    private function __clone() {}
}
