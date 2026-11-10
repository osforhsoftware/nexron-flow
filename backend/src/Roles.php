<?php

declare(strict_types=1);

final class Roles
{
    public const ALL = ['admin', 'office', 'field', 'store', 'accounts'];

    /** Simple Phase-0 modules — no RBAC matrix. */
    public const MODULES = [
        'admin' => [
            'dashboard', 'parties', 'items', 'sales', 'purchases', 'payments',
            'reports', 'companies', 'settings', 'backup', 'utilities', 'users',
        ],
        'office' => [
            'dashboard', 'parties', 'items', 'sales', 'purchases', 'reports', 'companies', 'settings',
        ],
        'field' => ['dashboard', 'parties', 'items', 'reports'],
        'store' => ['dashboard', 'parties', 'items', 'purchases', 'payments', 'reports'],
        'accounts' => [
            'dashboard', 'parties', 'sales', 'purchases', 'payments', 'reports', 'companies',
        ],
    ];

    public static function modulesFor(string $role): array
    {
        return self::MODULES[$role] ?? self::MODULES['office'];
    }

    public static function canAccess(string $role, string $module): bool
    {
        if ($role === 'admin') {
            return true;
        }
        return in_array($module, self::modulesFor($role), true);
    }

    public static function publicUser(array $user): array
    {
        $role = $user['role'] ?? 'office';
        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'name' => $user['name'],
            'phone' => $user['phone'] ?: null,
            'email' => $user['email'] ?: null,
            'role' => $role,
            'modules' => self::modulesFor($role),
        ];
    }
}
