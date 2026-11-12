<?php

declare(strict_types=1);

/**
 * RBAC admin API: modules tree, roles CRUD, user role assignment.
 */
final class ApiRbac
{
    private PDO $pdo;
    private array $config;

    public function __construct(PDO $pdo, array $config)
    {
        $this->pdo = $pdo;
        $this->config = $config;
    }

    public function handle(string $method, string $path): bool
    {
        if ($method === 'GET' && $path === '/api/modules') {
            $this->listModules();
            return true;
        }

        if ($method === 'GET' && $path === '/api/roles') {
            $this->listRoles();
            return true;
        }
        if ($method === 'POST' && $path === '/api/roles') {
            $this->createRole();
            return true;
        }
        if (preg_match('#^/api/roles/([^/]+)$#', $path, $m)) {
            $id = $m[1];
            if ($method === 'GET') {
                $this->getRole($id);
                return true;
            }
            if ($method === 'PUT' || $method === 'PATCH') {
                $this->updateRole($id);
                return true;
            }
            if ($method === 'DELETE') {
                $this->deleteRole($id);
                return true;
            }
        }

        if ($method === 'POST' && $path === '/api/users/assign-role') {
            $this->assignRole();
            return true;
        }

        return false;
    }

    private function listModules(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'read');
        Response::json(['modules' => Rbac::treeModules($this->pdo)]);
    }

    private function listRoles(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'read');
        $rows = $this->pdo->query(
            'SELECT id, name, status, created_at, updated_at FROM roles ORDER BY name ASC'
        )->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $out[] = $this->roleSummary($row);
        }
        Response::json(['roles' => $out]);
    }

    private function getRole(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'read');
        $role = $this->fetchRole($id);
        if (!$role) {
            Response::error('Role not found', 404);
        }
        Response::json(['role' => $this->roleDetail($role)]);
    }

    private function createRole(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'create');
        $body = Helpers::body();
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            Response::error('Role name required', 400);
        }
        $status = isset($body['status']) ? ((int) $body['status'] ? 1 : 0) : 1;
        $permissions = $body['permissions'] ?? [];
        if (!is_array($permissions)) {
            Response::error('permissions must be an array', 400);
        }

        $exists = $this->pdo->prepare('SELECT id FROM roles WHERE name = ? LIMIT 1');
        $exists->execute([$name]);
        if ($exists->fetch()) {
            Response::error('Role name already exists', 409);
        }

        $id = Helpers::cuid('role');
        $now = Helpers::now();
        try {
            $this->pdo->beginTransaction();
            $this->pdo->prepare(
                'INSERT INTO roles (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
            )->execute([$id, $name, $status, $now, $now]);
            $this->insertPermissionMatrix($id, $permissions, $now);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to create role: ' . $e->getMessage(), 500);
        }

        $role = $this->fetchRole($id);
        Response::json(['role' => $this->roleDetail($role)], 201);
    }

    private function updateRole(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'update');
        $role = $this->fetchRole($id);
        if (!$role) {
            Response::error('Role not found', 404);
        }

        $body = Helpers::body();
        $name = array_key_exists('name', $body) ? trim((string) $body['name']) : (string) $role['name'];
        if ($name === '') {
            Response::error('Role name required', 400);
        }
        $status = array_key_exists('status', $body)
            ? ((int) $body['status'] ? 1 : 0)
            : (int) $role['status'];
        $permissions = $body['permissions'] ?? null;
        if ($permissions !== null && !is_array($permissions)) {
            Response::error('permissions must be an array', 400);
        }

        $dup = $this->pdo->prepare('SELECT id FROM roles WHERE name = ? AND id <> ? LIMIT 1');
        $dup->execute([$name, $id]);
        if ($dup->fetch()) {
            Response::error('Role name already exists', 409);
        }

        $now = Helpers::now();
        try {
            $this->pdo->beginTransaction();
            $this->pdo->prepare(
                'UPDATE roles SET name = ?, status = ?, updated_at = ? WHERE id = ?'
            )->execute([$name, $status, $now, $id]);
            if (is_array($permissions)) {
                $this->pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?')->execute([$id]);
                $this->insertPermissionMatrix($id, $permissions, $now);
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to update role: ' . $e->getMessage(), 500);
        }

        $fresh = $this->fetchRole($id);
        Response::json(['role' => $this->roleDetail($fresh)]);
    }

    private function deleteRole(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'roles', 'delete');
        $role = $this->fetchRole($id);
        if (!$role) {
            Response::error('Role not found', 404);
        }

        try {
            $this->pdo->beginTransaction();
            $this->pdo->prepare('DELETE FROM role_permissions WHERE role_id = ?')->execute([$id]);
            $this->pdo->prepare('DELETE FROM user_roles WHERE role_id = ?')->execute([$id]);
            $this->pdo->prepare('DELETE FROM roles WHERE id = ?')->execute([$id]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to delete role: ' . $e->getMessage(), 500);
        }

        Response::json(['ok' => true]);
    }

    private function assignRole(): void
    {
        $actor = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $actor, 'users', 'update');
        $body = Helpers::body();
        $userId = trim((string) ($body['userId'] ?? $body['user_id'] ?? ''));
        $roleId = trim((string) ($body['roleId'] ?? $body['role_id'] ?? ''));
        if ($userId === '' || $roleId === '') {
            Response::error('userId and roleId required', 400);
        }

        $u = $this->pdo->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $u->execute([$userId]);
        if (!$u->fetch()) {
            Response::error('User not found', 404);
        }
        $r = $this->pdo->prepare('SELECT id, name FROM roles WHERE id = ? LIMIT 1');
        $r->execute([$roleId]);
        $role = $r->fetch();
        if (!$role) {
            Response::error('Role not found', 404);
        }

        $dup = $this->pdo->prepare('SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1');
        $dup->execute([$userId, $roleId]);
        if ($dup->fetch()) {
            Response::error('Role already assigned to this user', 409);
        }

        $id = Helpers::cuid('ur');
        $now = Helpers::now();
        $this->pdo->prepare(
            'INSERT INTO user_roles (id, user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)'
        )->execute([$id, $userId, $roleId, $actor['id'], $now]);

        // Keep legacy users.role in sync with primary assigned role slug when empty/default.
        $slug = strtolower(preg_replace('/\s+/', '', (string) $role['name']) ?: 'office');
        if (in_array($slug, Roles::ALL, true)) {
            $this->pdo->prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
                ->execute([$slug, $now, $userId]);
        }

        Response::json([
            'assignment' => [
                'id' => $id,
                'userId' => $userId,
                'roleId' => $roleId,
                'assignedBy' => $actor['id'],
                'assignedAt' => $now,
            ],
        ], 201);
    }

    /**
     * Batch insert permission matrix.
     * Accepts either:
     *  - [{ subModuleId, canCreate, canRead, canUpdate, canDelete }]
     *  - { "new_invoice": { create, read, update, delete } } keyed by directory
     */
    private function insertPermissionMatrix(string $roleId, array $permissions, string $now): void
    {
        $subById = [];
        $subByDir = [];
        foreach ($this->pdo->query('SELECT id, directory FROM sub_modules')->fetchAll() as $row) {
            $subById[$row['id']] = $row['directory'];
            $subByDir[$row['directory']] = $row['id'];
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO role_permissions
             (id, role_id, sub_module_id, can_create, can_read, can_update, can_delete, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );

        $isList = $permissions === [] || array_keys($permissions) === range(0, count($permissions) - 1);
        if ($isList) {
            foreach ($permissions as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $subId = (string) ($row['subModuleId'] ?? $row['sub_module_id'] ?? '');
                if ($subId === '' || !isset($subById[$subId])) {
                    continue;
                }
                $stmt->execute([
                    Helpers::cuid('rp'),
                    $roleId,
                    $subId,
                    $this->flag($row, 'canCreate', 'can_create', 'create'),
                    $this->flag($row, 'canRead', 'can_read', 'read'),
                    $this->flag($row, 'canUpdate', 'can_update', 'update'),
                    $this->flag($row, 'canDelete', 'can_delete', 'delete'),
                    $now,
                ]);
            }
            return;
        }

        foreach ($permissions as $directory => $actions) {
            if (!is_array($actions)) {
                continue;
            }
            $subId = $subByDir[(string) $directory] ?? null;
            if (!$subId) {
                continue;
            }
            $stmt->execute([
                Helpers::cuid('rp'),
                $roleId,
                $subId,
                !empty($actions['create']) || !empty($actions['canCreate']) || !empty($actions['can_create']) ? 1 : 0,
                !empty($actions['read']) || !empty($actions['canRead']) || !empty($actions['can_read']) ? 1 : 0,
                !empty($actions['update']) || !empty($actions['canUpdate']) || !empty($actions['can_update']) ? 1 : 0,
                !empty($actions['delete']) || !empty($actions['canDelete']) || !empty($actions['can_delete']) ? 1 : 0,
                $now,
            ]);
        }
    }

    private function flag(array $row, string ...$keys): int
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row)) {
                return !empty($row[$key]) ? 1 : 0;
            }
        }
        return 0;
    }

    private function fetchRole(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM roles WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function roleSummary(array $row): array
    {
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM role_permissions WHERE role_id = ?');
        $count->execute([$row['id']]);
        $users = $this->pdo->prepare('SELECT COUNT(*) FROM user_roles WHERE role_id = ?');
        $users->execute([$row['id']]);
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'status' => (int) $row['status'],
            'permissionCount' => (int) $count->fetchColumn(),
            'userCount' => (int) $users->fetchColumn(),
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    private function roleDetail(array $row): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT rp.*, sm.name AS sub_module_name, sm.directory, sm.module_id,
                    m.name AS module_name
             FROM role_permissions rp
             INNER JOIN sub_modules sm ON sm.id = rp.sub_module_id
             INNER JOIN modules m ON m.id = sm.module_id
             WHERE rp.role_id = ?
             ORDER BY m.sort_order ASC, sm.sort_order ASC'
        );
        $stmt->execute([$row['id']]);
        $perms = [];
        $byDirectory = [];
        foreach ($stmt->fetchAll() as $p) {
            $entry = [
                'id' => $p['id'],
                'subModuleId' => $p['sub_module_id'],
                'subModuleName' => $p['sub_module_name'],
                'directory' => $p['directory'],
                'moduleId' => $p['module_id'],
                'moduleName' => $p['module_name'],
                'canCreate' => (bool) (int) $p['can_create'],
                'canRead' => (bool) (int) $p['can_read'],
                'canUpdate' => (bool) (int) $p['can_update'],
                'canDelete' => (bool) (int) $p['can_delete'],
            ];
            $perms[] = $entry;
            $byDirectory[$p['directory']] = [
                'create' => $entry['canCreate'],
                'read' => $entry['canRead'],
                'update' => $entry['canUpdate'],
                'delete' => $entry['canDelete'],
            ];
        }

        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'status' => (int) $row['status'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'permissions' => $perms,
            'permissionMatrix' => $byDirectory,
            'modules' => Rbac::treeModules($this->pdo),
        ];
    }
}
