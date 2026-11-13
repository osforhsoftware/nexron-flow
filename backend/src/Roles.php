<?php

declare(strict_types=1);

final class Roles
{
    /** Legacy job-role strings kept for display / seed mapping. */
    public const ALL = ['admin', 'office', 'field', 'store', 'accounts'];

    /** @deprecated Use Rbac catalog; retained for older clients. */
    public const MODULES = [
        'admin' => [
            'dashboard', 'parties', 'items', 'equipment', 'service_calls', 'sales', 'purchases', 'payments',
            'reports', 'companies', 'settings', 'backup', 'utilities', 'users', 'roles',
        ],
        'office' => [
            'dashboard', 'parties', 'items', 'equipment', 'service_calls', 'sales', 'purchases', 'reports', 'companies', 'settings',
        ],
        'field' => ['dashboard', 'parties', 'items', 'equipment', 'service_calls', 'sales', 'reports'],
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

    /**
     * Public session user payload including aggregated RBAC permissions.
     *
     * @param array|null $permissions Precomputed permissions map keyed by directory
     * @param array|null $assignedRoles Role rows [{id,name,status}]
     */
    public static function publicUser(array $user, ?array $permissions = null, ?array $assignedRoles = null): array
    {
        $role = $user['role'] ?? 'office';
        $isSuper = Rbac::isSuperAdmin($user);
        if ($permissions === null) {
            $permissions = $user['_permissions'] ?? [];
        }
        if ($permissions === [] && !$isSuper) {
            // Caller didn't enrich — leave empty; prefer Roles::publicUserFromPdo.
        }
        $modules = $isSuper
            ? array_values(array_unique(array_merge(self::MODULES['admin'], ['roles', 'equipment', 'service_calls'])))
            : Rbac::modulesFromPermissions($permissions);

        $rolesOut = [];
        if (is_array($assignedRoles)) {
            foreach ($assignedRoles as $r) {
                $rolesOut[] = [
                    'id' => $r['id'],
                    'name' => $r['name'],
                    'status' => (int) ($r['status'] ?? 1),
                ];
            }
        }

        return [
            'id' => $user['id'],
            'username' => $user['username'],
            'name' => $user['name'],
            'phone' => $user['phone'] ?: null,
            'email' => $user['email'] ?: null,
            'role' => $role,
            'userType' => (int) ($user['user_type'] ?? 0),
            'isStaff' => (int) ($user['is_staff'] ?? 0) === 1,
            'isSuperAdmin' => $isSuper,
            'modules' => $modules,
            'permissions' => $permissions,
            'roles' => $rolesOut,
        ];
    }

    public static function publicUserFromPdo(PDO $pdo, array $user): array
    {
        $enriched = Rbac::enrichUser($pdo, $user);
        $roles = Rbac::rolesForUser($pdo, (string) $user['id']);
        return self::publicUser($enriched, $enriched['_permissions'], $roles);
    }
}
