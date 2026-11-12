<?php

declare(strict_types=1);

final class Auth
{
    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }

    public static function sign(array $payload, string $secret, int $ttlSeconds): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $now = time();
        $payload['iat'] = $now;
        $payload['exp'] = $now + $ttlSeconds;

        $segments = [
            self::base64UrlEncode(json_encode($header)),
            self::base64UrlEncode(json_encode($payload)),
        ];
        $signing = implode('.', $segments);
        $signature = hash_hmac('sha256', $signing, $secret, true);
        $segments[] = self::base64UrlEncode($signature);
        return implode('.', $segments);
    }

    public static function verify(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;
        $expected = self::base64UrlEncode(hash_hmac('sha256', $h . '.' . $p, $secret, true));
        if (!hash_equals($expected, $s)) {
            return null;
        }
        $payload = json_decode(self::base64UrlDecode($p), true);
        if (!is_array($payload)) {
            return null;
        }
        if (($payload['exp'] ?? 0) < time()) {
            return null;
        }
        return $payload;
    }

    public static function bearerUser(PDO $pdo, array $config): ?array
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(\S+)/i', $header, $m)) {
            return null;
        }
        $payload = self::verify($m[1], $config['jwt_secret']);
        if (!$payload || empty($payload['sub'])) {
            return null;
        }
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([(string) $payload['sub']]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public static function requireUser(PDO $pdo, array $config): array
    {
        $user = self::bearerUser($pdo, $config);
        if (!$user) {
            Response::error('Unauthorized', 401);
        }
        return Rbac::enrichUser($pdo, $user);
    }

    /**
     * Strict permission guard. Super admins (user_type == 1) bypass.
     * Returns 403 immediately when the session payload lacks the action.
     */
    public static function requirePermission(PDO $pdo, array $user, string $directory, string $action): void
    {
        if (Rbac::isSuperAdmin($user)) {
            return;
        }
        $permissions = $user['_permissions'] ?? Rbac::permissionsForUser($pdo, $user);
        if (!Rbac::can($permissions, $directory, $action)) {
            Response::error('Forbidden', 403);
        }
    }

    /**
     * @deprecated Prefer requirePermission. Kept for transitional callers;
     * non-super-admins must match the allowlist OR we reject with 403.
     */
    public static function requireRoles(array $user, array $roles): void
    {
        if (Rbac::isSuperAdmin($user)) {
            return;
        }
        if (($user['role'] ?? '') === 'admin') {
            return;
        }
        if (!in_array($user['role'] ?? '', $roles, true)) {
            Response::error('Forbidden', 403);
        }
    }
}
