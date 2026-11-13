<?php

declare(strict_types=1);

/**
 * Company backup files. Users, passwords, roles, and tokens are never included.
 * Monthly files live under storage/backups and are blocked by storage/.htaccess.
 */
final class Backup
{
    public static function ensureTable(PDO $pdo): void
    {
        $pdo->exec(
            <<<SQL
CREATE TABLE IF NOT EXISTS backup_settings (
  company_id VARCHAR(64) PRIMARY KEY,
  auto_monthly TINYINT(1) NOT NULL DEFAULT 1,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL
        );
    }

    /** @return array{autoMonthly:bool,updatedAt:string} */
    public static function settings(PDO $pdo, string $companyId): array
    {
        self::ensureTable($pdo);
        $stmt = $pdo->prepare('SELECT auto_monthly, updated_at FROM backup_settings WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $row = $stmt->fetch();
        if (!$row) {
            $now = Helpers::now();
            $pdo->prepare(
                'INSERT INTO backup_settings (company_id, auto_monthly, updated_at) VALUES (?, 1, ?)'
            )->execute([$companyId, $now]);
            return ['autoMonthly' => true, 'updatedAt' => $now];
        }
        return [
            'autoMonthly' => (int) $row['auto_monthly'] === 1,
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    public static function setAuto(PDO $pdo, string $companyId, bool $autoMonthly): void
    {
        self::ensureTable($pdo);
        $now = Helpers::now();
        $pdo->prepare(
            'INSERT INTO backup_settings (company_id, auto_monthly, updated_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE auto_monthly = VALUES(auto_monthly), updated_at = VALUES(updated_at)'
        )->execute([$companyId, $autoMonthly ? 1 : 0, $now]);
    }

    /**
     * Create this month's file once, the first time the company is used that month.
     * @param array<string,mixed> $company
     * @return array<string,mixed>|null
     */
    public static function ensureMonthly(PDO $pdo, array $config, array $company): ?array
    {
        $companyId = (string) $company['id'];
        $settings = self::settings($pdo, $companyId);
        if (!$settings['autoMonthly']) {
            return null;
        }
        $period = self::periodFor($company);
        $path = self::filePath($config, $companyId, $period);
        if (!is_file($path)) {
            self::write($path, self::encode($pdo, $company, 'monthly', $period));
        }
        return self::describe($period, $path);
    }

    /** @return array{autoMonthly:bool,updatedAt:string,backups:list<array<string,mixed>>} */
    public static function state(PDO $pdo, array $config, string $companyId): array
    {
        $settings = self::settings($pdo, $companyId);
        return [
            'autoMonthly' => $settings['autoMonthly'],
            'updatedAt' => $settings['updatedAt'],
            'backups' => self::listFiles($config, $companyId),
        ];
    }

    /** @param array<string,mixed> $company */
    public static function manualJson(PDO $pdo, array $company): string
    {
        return self::encode($pdo, $company, 'manual', null);
    }

    /** @param array<string,mixed> $company */
    public static function manualFilename(array $company): string
    {
        $clock = self::clock($company);
        return self::slug((string) ($company['name'] ?? 'company')) . '-backup-' . $clock->format('Y-m-d') . '.json';
    }

    /** @param array<string,mixed> $company */
    public static function storedFilename(array $company, string $period): string
    {
        return self::slug((string) ($company['name'] ?? 'company')) . '-backup-' . $period . '.json';
    }

    public static function read(array $config, string $companyId, string $period): ?string
    {
        if (!self::validPeriod($period)) {
            return null;
        }
        $path = self::filePath($config, $companyId, $period);
        if (!is_file($path)) {
            return null;
        }
        $body = file_get_contents($path);
        return $body === false ? null : $body;
    }

    /** @param array<string,mixed> $company */
    private static function encode(PDO $pdo, array $company, string $kind, ?string $period): string
    {
        $companyId = (string) $company['id'];
        $clock = self::clock($company);
        $data = [
            'partyTypes' => self::rows($pdo, 'SELECT * FROM party_types WHERE company_id = ? ORDER BY name', [$companyId]),
            'parties' => self::rows($pdo, 'SELECT * FROM parties WHERE company_id = ? ORDER BY name', [$companyId]),
            'itemCategories' => self::rows($pdo, 'SELECT * FROM item_categories WHERE company_id = ? ORDER BY name', [$companyId]),
            'items' => self::rows($pdo, 'SELECT * FROM items WHERE company_id = ? ORDER BY name', [$companyId]),
            'paymentTypes' => self::rows($pdo, 'SELECT * FROM payment_types WHERE company_id = ? ORDER BY name', [$companyId]),
            'transactions' => self::rows($pdo, 'SELECT * FROM transactions WHERE company_id = ? ORDER BY date, number', [$companyId]),
            'lineItems' => self::rows($pdo, 'SELECT * FROM line_items WHERE company_id = ?', [$companyId]),
            'masterData' => self::rows($pdo, 'SELECT * FROM master_data WHERE company_id = ? ORDER BY kind, sort_order', [$companyId]),
            'docs' => self::rows($pdo, 'SELECT * FROM docs WHERE company_id = ? ORDER BY date, number', [$companyId]),
            'docLines' => self::rows($pdo, 'SELECT * FROM doc_lines WHERE company_id = ?', [$companyId]),
            'docRevisions' => self::rows($pdo, 'SELECT * FROM doc_revisions WHERE company_id = ? ORDER BY created_at', [$companyId]),
            'equipment' => self::rows($pdo, 'SELECT * FROM equipment WHERE company_id = ? ORDER BY name', [$companyId]),
            'equipmentHistory' => self::rows(
                $pdo,
                'SELECT h.* FROM equipment_history h INNER JOIN equipment e ON e.id = h.equipment_id WHERE e.company_id = ? ORDER BY h.created_at',
                [$companyId]
            ),
            'serviceCalls' => self::rows($pdo, 'SELECT * FROM service_calls WHERE company_id = ? ORDER BY created_at', [$companyId]),
            'serviceVisits' => self::rows($pdo, 'SELECT * FROM service_visits WHERE company_id = ? ORDER BY visit_date', [$companyId]),
            'notifications' => self::rows($pdo, 'SELECT * FROM notifications WHERE company_id = ? ORDER BY created_at', [$companyId]),
        ];

        $counts = [];
        foreach ($data as $key => $rows) {
            $counts[$key] = count($rows);
        }

        $payload = [
            'format' => 'nexron-backup',
            'version' => 1,
            'kind' => $kind,
            'period' => $period,
            'exportedAt' => $clock->format(DateTimeInterface::ATOM),
            'company' => $company,
            'counts' => $counts,
            'data' => $data,
        ];
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            Response::error('Could not build backup', 500);
        }
        return $json;
    }

    /** @return list<array<string,mixed>> */
    private static function listFiles(array $config, string $companyId): array
    {
        $dir = self::companyDir($config, $companyId);
        if (!is_dir($dir)) {
            return [];
        }
        $items = [];
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
            $period = basename($path, '.json');
            if (!self::validPeriod($period)) {
                continue;
            }
            $items[] = self::describe($period, $path);
        }
        usort($items, static fn (array $a, array $b): int => strcmp((string) $b['period'], (string) $a['period']));
        return $items;
    }

    /** @return array{id:string,period:string,bytes:int,createdAt:string} */
    private static function describe(string $period, string $path): array
    {
        $mtime = filemtime($path);
        return [
            'id' => $period,
            'period' => $period,
            'bytes' => (int) (filesize($path) ?: 0),
            'createdAt' => gmdate('c', $mtime === false ? time() : $mtime),
        ];
    }

    /** @param array<string,mixed> $company */
    private static function periodFor(array $company): string
    {
        return self::clock($company)->format('Y-m');
    }

    /** @param array<string,mixed> $company */
    private static function clock(array $company): DateTimeImmutable
    {
        $tzName = (($company['country'] ?? 'AE') === 'IN') ? 'Asia/Kolkata' : 'Asia/Dubai';
        return new DateTimeImmutable('now', new DateTimeZone($tzName));
    }

    /** @return list<array<string,mixed>> */
    private static function rows(PDO $pdo, string $sql, array $params): array
    {
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            $state = (string) (($e->errorInfo[0] ?? '') ?: $e->getCode());
            if ($state === '42S02') {
                return [];
            }
            throw $e;
        }
    }

    private static function write(string $path, string $json): void
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            Response::error('Could not store backup', 500);
        }
        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            Response::error('Could not store backup', 500);
        }
        if (!rename($tmp, $path)) {
            if (!is_file($path)) {
                @unlink($tmp);
                Response::error('Could not store backup', 500);
            }
            @unlink($tmp);
        }
    }

    private static function filePath(array $config, string $companyId, string $period): string
    {
        self::assertCompanyId($companyId);
        if (!self::validPeriod($period)) {
            Response::error('Invalid backup', 400);
        }
        return self::companyDir($config, $companyId) . DIRECTORY_SEPARATOR . $period . '.json';
    }

    private static function companyDir(array $config, string $companyId): string
    {
        self::assertCompanyId($companyId);
        $root = (string) ($config['backup_dir'] ?? dirname(__DIR__) . '/storage/backups');
        return rtrim($root, '/\\') . DIRECTORY_SEPARATOR . $companyId;
    }

    private static function assertCompanyId(string $companyId): void
    {
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $companyId)) {
            Response::error('Invalid company', 400);
        }
    }

    private static function validPeriod(string $period): bool
    {
        return (bool) preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period);
    }

    private static function slug(string $name): string
    {
        $slug = strtolower(trim($name));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? 'company';
        $slug = trim($slug, '-');
        if ($slug === '') {
            return 'company';
        }
        return substr($slug, 0, 40);
    }
}
