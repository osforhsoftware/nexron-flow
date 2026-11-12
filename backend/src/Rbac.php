<?php

declare(strict_types=1);

/**
 * Database-backed RBAC: modules → sub_modules (directory keys) → role_permissions,
 * merged across all roles assigned to a user (OR semantics).
 */
final class Rbac
{
    public const SUPER_ADMIN_TYPE = 1;

    /** @var list<array{name:string, sort:int, subs:list<array{name:string, directory:string, sort:int}>}> */
    public const CATALOG = [
        [
            'name' => 'Dashboard',
            'sort' => 10,
            'subs' => [
                ['name' => 'Dashboard', 'directory' => 'dashboard', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Parties',
            'sort' => 20,
            'subs' => [
                ['name' => 'Parties', 'directory' => 'parties', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Items',
            'sort' => 30,
            'subs' => [
                ['name' => 'Products & Services', 'directory' => 'items', 'sort' => 1],
                ['name' => 'Equipment', 'directory' => 'equipment', 'sort' => 2],
            ],
        ],
        [
            'name' => 'Sales',
            'sort' => 40,
            'subs' => [
                ['name' => 'Sales Overview', 'directory' => 'sales', 'sort' => 1],
                ['name' => 'Sale Invoice', 'directory' => 'new_invoice', 'sort' => 2],
                ['name' => 'Quotations', 'directory' => 'quotations', 'sort' => 3],
                ['name' => 'Sale Orders', 'directory' => 'sale_orders', 'sort' => 4],
                ['name' => 'Delivery Challan', 'directory' => 'delivery', 'sort' => 5],
            ],
        ],
        [
            'name' => 'Purchases',
            'sort' => 50,
            'subs' => [
                ['name' => 'Purchase Overview', 'directory' => 'purchases', 'sort' => 1],
                ['name' => 'RFQ', 'directory' => 'rfq', 'sort' => 2],
                ['name' => 'Purchase Orders', 'directory' => 'purchase_orders', 'sort' => 3],
                ['name' => 'GRN', 'directory' => 'grn', 'sort' => 4],
                ['name' => 'Purchase Returns', 'directory' => 'purchase_returns', 'sort' => 5],
                ['name' => 'Purchase Bills', 'directory' => 'purchase_bills', 'sort' => 6],
            ],
        ],
        [
            'name' => 'Service',
            'sort' => 55,
            'subs' => [
                ['name' => 'Service Calls', 'directory' => 'service_calls', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Cash & Bank',
            'sort' => 60,
            'subs' => [
                ['name' => 'Payments', 'directory' => 'payments', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Reports',
            'sort' => 70,
            'subs' => [
                ['name' => 'Reports', 'directory' => 'reports', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Companies',
            'sort' => 80,
            'subs' => [
                ['name' => 'Companies', 'directory' => 'companies', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Settings',
            'sort' => 90,
            'subs' => [
                ['name' => 'Settings', 'directory' => 'settings', 'sort' => 1],
            ],
        ],
        [
            'name' => 'Tools',
            'sort' => 100,
            'subs' => [
                ['name' => 'Backup', 'directory' => 'backup', 'sort' => 1],
                ['name' => 'Utilities', 'directory' => 'utilities', 'sort' => 2],
            ],
        ],
        [
            'name' => 'Administration',
            'sort' => 110,
            'subs' => [
                ['name' => 'Users', 'directory' => 'users', 'sort' => 1],
                ['name' => 'Roles', 'directory' => 'roles', 'sort' => 2],
            ],
        ],
    ];

    /** Default role → directories with full CRUD (except noted). */
    public const DEFAULT_ROLE_DIRS = [
        'Admin' => ['*'],
        'Office' => [
            'dashboard', 'parties', 'items', 'equipment', 'service_calls', 'sales', 'new_invoice', 'quotations',
            'sale_orders', 'delivery', 'purchases', 'rfq', 'purchase_orders', 'grn',
            'purchase_returns', 'purchase_bills', 'reports', 'companies', 'settings',
        ],
        'Field' => [
            'dashboard', 'parties', 'items', 'equipment', 'service_calls',
            'sales', 'new_invoice', 'sale_orders', 'delivery', 'reports',
        ],
        'Store' => [
            'dashboard', 'parties', 'items', 'equipment', 'purchases', 'rfq', 'purchase_orders',
            'grn', 'purchase_returns', 'purchase_bills', 'payments', 'reports',
        ],
        'Accounts' => [
            'dashboard', 'parties', 'sales', 'new_invoice', 'quotations', 'sale_orders', 'delivery',
            'purchases', 'rfq', 'purchase_orders', 'grn', 'purchase_returns', 'purchase_bills',
            'payments', 'reports', 'companies',
        ],
    ];

    /** Map commercial doc_type → permission directory. */
    public const DOC_DIRECTORY = [
        'quotation' => 'quotations',
        'sale_order' => 'sale_orders',
        'delivery' => 'delivery',
        'rfq' => 'rfq',
        'purchase_order' => 'purchase_orders',
        'grn' => 'grn',
        'purchase_return' => 'purchase_returns',
    ];

    public static function isSuperAdmin(array $user): bool
    {
        return (int) ($user['user_type'] ?? 0) === self::SUPER_ADMIN_TYPE;
    }

    public static function ensureCatalog(PDO $pdo): void
    {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM modules')->fetchColumn();
        if ($count === 0) {
            self::seedCatalog($pdo);
            return;
        }
        // Existing installs: upsert any new catalog modules/directories (e.g. service_calls).
        self::seedCatalog($pdo);
        self::ensureMissingRoleDirectoryPerms($pdo);
    }

    /**
     * Insert missing role_permissions for directories listed in DEFAULT_ROLE_DIRS
     * without wiping custom role edits.
     */
    public static function ensureMissingRoleDirectoryPerms(PDO $pdo): void
    {
        $now = Helpers::now();
        $subs = $pdo->query('SELECT id, directory FROM sub_modules WHERE status = 1')->fetchAll();
        $byDir = [];
        foreach ($subs as $s) {
            $byDir[$s['directory']] = $s['id'];
        }
        $permStmt = $pdo->prepare(
            'INSERT INTO role_permissions (id, role_id, sub_module_id, can_create, can_read, can_update, can_delete, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $existsStmt = $pdo->prepare(
            'SELECT id FROM role_permissions WHERE role_id = ? AND sub_module_id = ? LIMIT 1'
        );
        $fieldWriteDirs = ['new_invoice', 'sale_orders', 'delivery', 'sales', 'parties', 'service_calls', 'equipment'];

        foreach (self::DEFAULT_ROLE_DIRS as $roleName => $dirs) {
            $find = $pdo->prepare('SELECT id FROM roles WHERE name = ? LIMIT 1');
            $find->execute([$roleName]);
            $existing = $find->fetch();
            if (!$existing) {
                continue;
            }
            $roleId = $existing['id'];
            $all = in_array('*', $dirs, true);
            foreach ($byDir as $directory => $subId) {
                $allow = $all || in_array($directory, $dirs, true);
                if (!$allow) {
                    continue;
                }
                $existsStmt->execute([$roleId, $subId]);
                if ($existsStmt->fetch()) {
                    continue;
                }
                $write = $roleName !== 'Field' || in_array($directory, $fieldWriteDirs, true);
                $permStmt->execute([
                    Helpers::cuid('rp'),
                    $roleId,
                    $subId,
                    $write ? 1 : 0,
                    1,
                    $write ? 1 : 0,
                    $write ? 1 : 0,
                    $now,
                ]);
            }
        }
    }

    public static function seedCatalog(PDO $pdo): void
    {
        $now = Helpers::now();
        $modStmt = $pdo->prepare(
            'INSERT INTO modules (id, name, status, sort_order, created_at, updated_at)
             VALUES (?, ?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)'
        );
        $subStmt = $pdo->prepare(
            'INSERT INTO sub_modules (id, module_id, name, directory, status, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), module_id = VALUES(module_id),
               sort_order = VALUES(sort_order), updated_at = VALUES(updated_at)'
        );

        foreach (self::CATALOG as $mod) {
            $modId = Helpers::cuid('mod');
            $existing = $pdo->prepare('SELECT id FROM modules WHERE name = ? LIMIT 1');
            $existing->execute([$mod['name']]);
            $row = $existing->fetch();
            if ($row) {
                $modId = $row['id'];
                $pdo->prepare('UPDATE modules SET sort_order = ?, updated_at = ? WHERE id = ?')
                    ->execute([$mod['sort'], $now, $modId]);
            } else {
                $modStmt->execute([$modId, $mod['name'], $mod['sort'], $now, $now]);
            }

            foreach ($mod['subs'] as $sub) {
                $subId = Helpers::cuid('smod');
                $find = $pdo->prepare('SELECT id FROM sub_modules WHERE directory = ? LIMIT 1');
                $find->execute([$sub['directory']]);
                $found = $find->fetch();
                if ($found) {
                    $pdo->prepare(
                        'UPDATE sub_modules SET module_id = ?, name = ?, sort_order = ?, status = 1, updated_at = ? WHERE id = ?'
                    )->execute([$modId, $sub['name'], $sub['sort'], $now, $found['id']]);
                } else {
                    $subStmt->execute([
                        $subId, $modId, $sub['name'], $sub['directory'], $sub['sort'], $now, $now,
                    ]);
                }
            }
        }
    }

    public static function seedDefaultRoles(PDO $pdo): void
    {
        self::seedCatalog($pdo);
        $now = Helpers::now();
        $subs = $pdo->query('SELECT id, directory FROM sub_modules WHERE status = 1')->fetchAll();
        $byDir = [];
        foreach ($subs as $s) {
            $byDir[$s['directory']] = $s['id'];
        }

        $roleStmt = $pdo->prepare(
            'INSERT INTO roles (id, name, status, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
        );
        $permStmt = $pdo->prepare(
            'INSERT INTO role_permissions (id, role_id, sub_module_id, can_create, can_read, can_update, can_delete, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        foreach (self::DEFAULT_ROLE_DIRS as $roleName => $dirs) {
            $find = $pdo->prepare('SELECT id FROM roles WHERE name = ? LIMIT 1');
            $find->execute([$roleName]);
            $existing = $find->fetch();
            if ($existing) {
                $roleId = $existing['id'];
                $pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?')->execute([$roleId]);
            } else {
                $roleId = Helpers::cuid('role');
                $roleStmt->execute([$roleId, $roleName, $now, $now]);
            }

            $all = in_array('*', $dirs, true);
            foreach ($byDir as $directory => $subId) {
                $allow = $all || in_array($directory, $dirs, true);
                if (!$allow) {
                    continue;
                }
                // Field: write on sales + service workflow; read-only on catalog/reports.
                $fieldWriteDirs = ['new_invoice', 'sale_orders', 'delivery', 'sales', 'parties', 'service_calls', 'equipment'];
                $write = $roleName !== 'Field' || in_array($directory, $fieldWriteDirs, true);
                $permStmt->execute([
                    Helpers::cuid('rp'),
                    $roleId,
                    $subId,
                    $write ? 1 : 0,
                    1,
                    $write ? 1 : 0,
                    $write ? 1 : 0,
                    $now,
                ]);
            }
        }
    }

    /**
     * Aggregate permissions across all assigned roles (OR).
     * @return array<string, array{create:bool, read:bool, update:bool, delete:bool}>
     */
    public static function permissionsForUser(PDO $pdo, array $user): array
    {
        if (self::isSuperAdmin($user)) {
            return self::allPermissionsTrue($pdo);
        }

        $stmt = $pdo->prepare(
            'SELECT sm.directory,
                    MAX(rp.can_create) AS can_create,
                    MAX(rp.can_read) AS can_read,
                    MAX(rp.can_update) AS can_update,
                    MAX(rp.can_delete) AS can_delete
             FROM user_roles ur
             INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
             INNER JOIN sub_modules sm ON sm.id = rp.sub_module_id AND sm.status = 1
             INNER JOIN roles r ON r.id = ur.role_id AND r.status = 1
             WHERE ur.user_id = ?
             GROUP BY sm.directory'
        );
        $stmt->execute([(string) $user['id']]);
        $rows = $stmt->fetchAll();

        // Legacy fallback: map users.role string to seeded role name when no user_roles rows.
        if (!$rows && !empty($user['role'])) {
            $legacy = self::legacyRoleName((string) $user['role']);
            $stmt = $pdo->prepare(
                'SELECT sm.directory,
                        MAX(rp.can_create) AS can_create,
                        MAX(rp.can_read) AS can_read,
                        MAX(rp.can_update) AS can_update,
                        MAX(rp.can_delete) AS can_delete
                 FROM roles r
                 INNER JOIN role_permissions rp ON rp.role_id = r.id
                 INNER JOIN sub_modules sm ON sm.id = rp.sub_module_id AND sm.status = 1
                 WHERE r.name = ? AND r.status = 1
                 GROUP BY sm.directory'
            );
            $stmt->execute([$legacy]);
            $rows = $stmt->fetchAll();
        }

        $out = [];
        foreach ($rows as $row) {
            $create = (bool) (int) $row['can_create'];
            $read = (bool) (int) $row['can_read'];
            $update = (bool) (int) $row['can_update'];
            $delete = (bool) (int) $row['can_delete'];
            if (!($create || $read || $update || $delete)) {
                continue;
            }
            $out[(string) $row['directory']] = [
                'create' => $create,
                'read' => $read,
                'update' => $update,
                'delete' => $delete,
            ];
        }
        return $out;
    }

    /** @return array<string, array{create:bool, read:bool, update:bool, delete:bool}> */
    public static function allPermissionsTrue(PDO $pdo): array
    {
        $rows = $pdo->query('SELECT directory FROM sub_modules WHERE status = 1')->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['directory']] = [
                'create' => true,
                'read' => true,
                'update' => true,
                'delete' => true,
            ];
        }
        return $out;
    }

    public static function legacyRoleName(string $role): string
    {
        $map = [
            'admin' => 'Admin',
            'office' => 'Office',
            'field' => 'Field',
            'store' => 'Store',
            'accounts' => 'Accounts',
        ];
        return $map[strtolower($role)] ?? 'Office';
    }

    /**
     * @param array<string, array{create?:bool, read?:bool, update?:bool, delete?:bool}> $permissions
     */
    public static function can(array $permissions, string $directory, string $action): bool
    {
        $key = strtolower($action);
        if (!in_array($key, ['create', 'read', 'update', 'delete'], true)) {
            return false;
        }
        $entry = $permissions[$directory] ?? null;
        if (!$entry) {
            return false;
        }
        return !empty($entry[$key]);
    }

    /** Modules list for nav: directories where read is allowed. */
    public static function modulesFromPermissions(array $permissions): array
    {
        $mods = [];
        foreach ($permissions as $directory => $actions) {
            if (!empty($actions['read']) || !empty($actions['create']) || !empty($actions['update']) || !empty($actions['delete'])) {
                $mods[] = $directory;
            }
        }
        // Parent aliases used by legacy ROUTE_MODULE / canAccess checks.
        $alias = [
            'new_invoice' => 'sales',
            'quotations' => 'sales',
            'sale_orders' => 'sales',
            'delivery' => 'sales',
            'rfq' => 'purchases',
            'purchase_orders' => 'purchases',
            'grn' => 'purchases',
            'purchase_returns' => 'purchases',
            'purchase_bills' => 'purchases',
            'equipment' => 'items',
        ];
        foreach ($alias as $dir => $parent) {
            if (in_array($dir, $mods, true) && !in_array($parent, $mods, true)) {
                $mods[] = $parent;
            }
        }
        sort($mods);
        return array_values(array_unique($mods));
    }

    public static function enrichUser(PDO $pdo, array $user): array
    {
        $permissions = self::permissionsForUser($pdo, $user);
        $user['_permissions'] = $permissions;
        $user['_is_super_admin'] = self::isSuperAdmin($user);
        return $user;
    }

    public static function rolesForUser(PDO $pdo, string $userId): array
    {
        $stmt = $pdo->prepare(
            'SELECT r.id, r.name, r.status
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ?
             ORDER BY r.name ASC'
        );
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function treeModules(PDO $pdo): array
    {
        $modules = $pdo->query(
            'SELECT id, name, status, sort_order FROM modules WHERE status = 1 ORDER BY sort_order ASC, name ASC'
        )->fetchAll();
        $subs = $pdo->query(
            'SELECT id, module_id, name, directory, status, sort_order
             FROM sub_modules WHERE status = 1 ORDER BY sort_order ASC, name ASC'
        )->fetchAll();
        $byMod = [];
        foreach ($subs as $s) {
            $byMod[$s['module_id']][] = [
                'id' => $s['id'],
                'name' => $s['name'],
                'directory' => $s['directory'],
                'status' => (int) $s['status'],
                'sortOrder' => (int) $s['sort_order'],
            ];
        }
        $out = [];
        foreach ($modules as $m) {
            $out[] = [
                'id' => $m['id'],
                'name' => $m['name'],
                'status' => (int) $m['status'],
                'sortOrder' => (int) $m['sort_order'],
                'subModules' => $byMod[$m['id']] ?? [],
            ];
        }
        return $out;
    }

    public static function directoryForDocType(string $docType): string
    {
        return self::DOC_DIRECTORY[$docType] ?? $docType;
    }
}
