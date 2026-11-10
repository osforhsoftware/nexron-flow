<?php

declare(strict_types=1);

/**
 * Phase 0 DB: MySQL / MariaDB (XAMPP).
 * Change host/user/pass/name to match your phpMyAdmin setup.
 */
return [
    'app_name' => 'NEXRON Flow API',
    'env' => 'local',

    'db' => [
        'driver' => 'mysql',
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'ledgerly',
        'user' => 'root',
        'pass' => '', // XAMPP default is empty password
        'charset' => 'utf8mb4',
    ],

    'jwt_secret' => 'ledgerly-phase0-php-secret-change-me',
    'jwt_ttl_seconds' => 60 * 60 * 24 * 7,
    'cors_origin' => '*',
];
