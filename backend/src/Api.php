<?php

declare(strict_types=1);

final class Api
{
    private PDO $pdo;
    private array $config;

    public function __construct(PDO $pdo, array $config)
    {
        $this->pdo = $pdo;
        $this->config = $config;
    }

    public function handle(string $method, string $path): void
    {
        $path = '/' . trim($path, '/');
        if ($path === '/') {
            $path = '';
        }

        if ($method === 'GET' && $path === '/api/health') {
            Response::json(['ok' => true, 'phase' => 2, 'name' => 'ledgerly-php-backend']);
        }

        $docs = new Docs($this->pdo, $this->config);
        if ($docs->handle($method, $path)) {
            return;
        }

        $rbac = new ApiRbac($this->pdo, $this->config);
        if ($rbac->handle($method, $path)) {
            return;
        }

        if ($method === 'POST' && $path === '/api/auth/login') {
            $this->login();
        }
        if ($method === 'GET' && $path === '/api/auth/me') {
            $this->me();
        }

        if ($method === 'GET' && $path === '/api/companies') {
            $this->listCompanies();
        }
        if ($method === 'POST' && $path === '/api/companies') {
            $this->createCompany();
        }
        if (preg_match('#^/api/companies/([^/]+)$#', $path, $m)) {
            if ($method === 'GET') {
                $this->getCompany($m[1]);
            }
            if ($method === 'PATCH') {
                $this->updateCompany($m[1]);
            }
        }

        if ($method === 'GET' && $path === '/api/party-types') {
            $this->listPartyTypes();
        }
        if ($method === 'POST' && $path === '/api/party-types') {
            $this->createPartyType();
        }
        if (preg_match('#^/api/party-types/([^/]+)$#', $path, $m)) {
            if ($method === 'DELETE') {
                $this->deletePartyType($m[1]);
            }
        }

        if ($method === 'GET' && $path === '/api/parties') {
            $this->listParties();
        }
        if ($method === 'POST' && $path === '/api/parties') {
            $this->createParty();
        }
        if (preg_match('#^/api/parties/([^/]+)$#', $path, $m)) {
            if ($method === 'PATCH') {
                $this->updateParty($m[1]);
            }
            if ($method === 'DELETE') {
                $this->deleteParty($m[1]);
            }
        }

        if ($method === 'GET' && $path === '/api/item-categories') {
            $this->listItemCategories();
        }
        if ($method === 'POST' && $path === '/api/item-categories') {
            $this->createItemCategory();
        }
        if (preg_match('#^/api/item-categories/([^/]+)$#', $path, $m) && $method === 'DELETE') {
            $this->deleteItemCategory($m[1]);
        }

        if ($method === 'GET' && $path === '/api/items') {
            $this->listItems();
        }
        if ($method === 'POST' && $path === '/api/items') {
            $this->createItem();
        }
        if ($method === 'POST' && $path === '/api/items/bulk') {
            $this->bulkCreateItems();
        }
        if (preg_match('#^/api/items/([^/]+)$#', $path, $m)) {
            if ($method === 'PATCH') {
                $this->updateItem($m[1]);
            }
            if ($method === 'DELETE') {
                $this->deleteItem($m[1]);
            }
        }

        if ($method === 'GET' && $path === '/api/equipment') {
            $this->listEquipment();
        }
        if ($method === 'POST' && $path === '/api/equipment') {
            $this->createEquipment();
        }
        if (preg_match('#^/api/equipment/([^/]+)$#', $path, $m) && $method === 'PATCH') {
            $this->updateEquipment($m[1]);
        }
        if ($method === 'PATCH' && $path === '/api/equipment') {
            $id = (string) ($_GET['id'] ?? '');
            if ($id === '') {
                Response::error('id required', 400);
            }
            $this->updateEquipment($id);
        }

        if ($method === 'GET' && $path === '/api/service-calls') {
            $this->listServiceCalls();
        }
        if ($method === 'POST' && $path === '/api/service-calls') {
            $this->createServiceCall();
        }
        if (preg_match('#^/api/service-calls/([^/]+)$#', $path, $m)) {
            if ($method === 'GET') {
                $this->getServiceCall($m[1]);
            }
            if ($method === 'PATCH') {
                $this->updateServiceCall($m[1]);
            }
        }

        if ($method === 'GET' && preg_match('#^/api/scan/product/([^/]+)$#', $path, $m)) {
            $this->scanProduct($m[1]);
        }
        if ($method === 'GET' && preg_match('#^/api/scan/equipment/([^/]+)$#', $path, $m)) {
            $this->scanEquipment($m[1]);
        }

        if ($method === 'GET' && $path === '/api/payments/accounts') {
            $this->listAccounts();
        }
        if ($method === 'POST' && $path === '/api/payments/accounts') {
            $this->createAccount();
        }

        if ($method === 'GET' && $path === '/api/transactions') {
            $this->listTransactions();
        }
        if ($method === 'POST' && $path === '/api/transactions') {
            $this->createTransaction();
        }
        if (preg_match('#^/api/transactions/([^/]+)$#', $path, $m) && $method === 'GET') {
            $this->getTransaction($m[1]);
        }
        if (preg_match('#^/api/transactions/([^/]+)$#', $path, $m) && ($method === 'PUT' || $method === 'PATCH')) {
            $this->updateTransaction($m[1]);
        }
        if (preg_match('#^/api/transactions/([^/]+)$#', $path, $m) && $method === 'DELETE') {
            $this->deleteTransaction($m[1]);
        }

        if ($method === 'GET' && $path === '/api/master') {
            $this->listMaster();
        }
        if ($method === 'POST' && $path === '/api/master') {
            $this->createMaster();
        }

        if ($method === 'GET' && $path === '/api/users') {
            $this->listUsers();
        }
        if ($method === 'POST' && $path === '/api/users') {
            $this->createUser();
        }

        Response::error('Not found', 404);
    }

    private function login(): void
    {
        $body = Helpers::body();
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        if ($username === '' || $password === '') {
            Response::error('Username and password required', 400);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        if (!$user || !(int) $user['is_active'] || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid username or password', 401);
        }
        $token = Auth::sign(
            [
                'sub' => $user['id'],
                'username' => $user['username'],
                'role' => $user['role'],
                'user_type' => (int) ($user['user_type'] ?? 0),
            ],
            $this->config['jwt_secret'],
            (int) $this->config['jwt_ttl_seconds']
        );
        Response::json(['token' => $token, 'user' => Roles::publicUserFromPdo($this->pdo, $user)]);
    }

    private function me(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Response::json(['user' => Roles::publicUserFromPdo($this->pdo, $user)]);
    }

    /** Map sale/purchase/payment txn types to RBAC directory keys. */
    private function txnDirectory(string $type): string
    {
        return match ($type) {
            'sale' => 'new_invoice',
            'purchase' => 'purchase_bills',
            'payment_in', 'payment_out' => 'payments',
            default => 'payments',
        };
    }

    private function listCompanies(): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $rows = $this->pdo->query('SELECT * FROM companies ORDER BY name ASC')->fetchAll();
        Response::json(['companies' => array_map([Helpers::class, 'companyToApi'], $rows)]);
    }

    private function getCompany(string $id): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT * FROM companies WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Company not found', 404);
        }
        Response::json(['company' => Helpers::companyToApi($row)]);
    }

    private function createCompany(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'companies', 'create');
        $body = Helpers::body();
        $name = trim((string) ($body['name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? ''));
        if ($name === '' || $phone === '') {
            Response::error('Invalid company data', 400);
        }
        $id = Helpers::cuid('co');
        $now = Helpers::now();
        $country = Helpers::normalizeCountry($body['country'] ?? null);
        $currency = Helpers::normalizeCurrency($body['currency'] ?? null, $country);
        $taxType = Helpers::normalizeTaxType($body['taxType'] ?? null, $country);
        $stmt = $this->pdo->prepare(
            'INSERT INTO companies (id, name, phone, email, gstin, address, state, country, currency, tax_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id, $name, $phone,
            $this->nullable($body['email'] ?? null),
            $this->nullable($body['gstin'] ?? null),
            $this->nullable($body['address'] ?? null),
            $this->nullable($body['state'] ?? null),
            $country,
            $currency,
            $taxType,
            $now, $now,
        ]);
        $this->getCompany($id);
    }

    private function updateCompany(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'companies', 'update');
        $body = Helpers::body();
        if (array_key_exists('country', $body)) {
            $body['country'] = Helpers::normalizeCountry($body['country'] ?? null);
        }
        if (array_key_exists('currency', $body) || array_key_exists('country', $body)) {
            $country = Helpers::normalizeCountry($body['country'] ?? null);
            $body['currency'] = Helpers::normalizeCurrency($body['currency'] ?? null, $country);
        }
        if (array_key_exists('taxType', $body) || array_key_exists('country', $body)) {
            $country = Helpers::normalizeCountry(
                $body['country'] ?? null
            );
            // When only country is sent, keep existing tax_type unless taxType is also provided.
            if (array_key_exists('taxType', $body)) {
                $body['taxType'] = Helpers::normalizeTaxType($body['taxType'] ?? null, $country);
            }
        }
        $fields = [];
        $params = [];
        $map = [
            'name' => 'name',
            'phone' => 'phone',
            'email' => 'email',
            'gstin' => 'gstin',
            'address' => 'address',
            'state' => 'state',
            'country' => 'country',
            'currency' => 'currency',
            'taxType' => 'tax_type',
            'logoUrl' => 'logo_url',
            'signatureUrl' => 'signature_url',
            'defaultTerms' => 'default_terms',
            'assetTagStart' => 'asset_tag_start',
            'settings' => 'settings_json',
        ];
        foreach ($map as $apiKey => $column) {
            if (array_key_exists($apiKey, $body)) {
                $fields[] = $column . ' = ?';
                if ($apiKey === 'assetTagStart') {
                    $params[] = Helpers::normalizeAssetTagStart((string) $body[$apiKey]) ?? 'EQ-0001';
                } elseif ($apiKey === 'settings') {
                    $normalized = Helpers::normalizeCompanySettings($body['settings']);
                    if (!$normalized['ok']) {
                        Response::error((string) ($normalized['error'] ?? 'Invalid settings'), 400);
                    }
                    $settings = $normalized['settings'] ?? null;
                    $params[] = $settings === null ? null : json_encode($settings, JSON_UNESCAPED_UNICODE);
                } elseif (in_array($apiKey, ['email', 'gstin', 'address', 'state', 'logoUrl', 'signatureUrl', 'defaultTerms'], true)) {
                    $params[] = $this->nullable($body[$apiKey]);
                } else {
                    $params[] = trim((string) $body[$apiKey]);
                }
            }
        }
        if (!$fields) {
            Response::error('No fields to update', 400);
        }
        $fields[] = 'updated_at = ?';
        $params[] = Helpers::now();
        $params[] = $id;
        $sql = 'UPDATE companies SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $this->getCompany($id);
    }

    private function listParties(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE company_id = ? ORDER BY name ASC');
        $stmt->execute([$companyId]);
        Response::json(['parties' => array_map([Helpers::class, 'partyToApi'], $stmt->fetchAll())]);
    }

    private function createParty(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $type = trim((string) ($body['type'] ?? 'not_specified'));
        if ($type === '') {
            $type = 'not_specified';
        }
        if ($companyId === '' || $name === '' || strlen($type) > 80) {
            Response::error('Invalid party data', 400);
        }
        $id = Helpers::cuid('pty');
        $now = Helpers::now();
        $license = $this->nullable($body['licenseGst'] ?? $body['gstin'] ?? null);
        $stmt = $this->pdo->prepare(
            'INSERT INTO parties (
                id, company_id, name, phone, email, gstin, type, type_other, contact_person,
                opening_balance, balance_type, address, city, country, license_gst, price_category,
                delivery_address, additional_fields, notes, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id, $companyId, $name,
            $this->nullable($body['phone'] ?? null),
            $this->nullable($body['email'] ?? null),
            $license,
            $type,
            $this->nullable($body['typeOther'] ?? null),
            $this->nullable($body['contactPerson'] ?? null),
            (float) ($body['openingBalance'] ?? 0),
            (string) ($body['balanceType'] ?? 'to_receive'),
            $this->nullable($body['address'] ?? null),
            $this->nullable($body['city'] ?? null),
            $this->nullable($body['country'] ?? null),
            $license,
            $this->nullable($body['priceCategory'] ?? null),
            $this->nullable($body['deliveryAddress'] ?? null),
            Helpers::encodeAdditionalFields($body['additionalFields'] ?? null),
            $this->nullable($body['notes'] ?? null),
            $now, $now,
        ]);
        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['party' => Helpers::partyToApi($stmt->fetch())], 201);
    }

    private function updateParty(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'update');
        $body = Helpers::body();
        $map = [
            'name' => 'name',
            'phone' => 'phone',
            'email' => 'email',
            'gstin' => 'gstin',
            'type' => 'type',
            'typeOther' => 'type_other',
            'contactPerson' => 'contact_person',
            'openingBalance' => 'opening_balance',
            'balanceType' => 'balance_type',
            'address' => 'address',
            'city' => 'city',
            'country' => 'country',
            'licenseGst' => 'license_gst',
            'priceCategory' => 'price_category',
            'deliveryAddress' => 'delivery_address',
            'additionalFields' => 'additional_fields',
            'notes' => 'notes',
        ];
        $fields = [];
        $params = [];
        foreach ($map as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $fields[] = $col . ' = ?';
            if ($api === 'additionalFields') {
                $params[] = Helpers::encodeAdditionalFields($body[$api]);
            } elseif (in_array($api, [
                'phone', 'email', 'gstin', 'address', 'typeOther', 'contactPerson',
                'city', 'country', 'licenseGst', 'priceCategory', 'deliveryAddress', 'notes',
            ], true)) {
                $params[] = $this->nullable($body[$api]);
            } elseif ($api === 'openingBalance') {
                $params[] = (float) $body[$api];
            } else {
                $params[] = is_string($body[$api]) ? trim($body[$api]) : $body[$api];
            }
        }
        if (array_key_exists('licenseGst', $body) && !array_key_exists('gstin', $body)) {
            $fields[] = 'gstin = ?';
            $params[] = $this->nullable($body['licenseGst']);
        }
        if (!$fields) {
            Response::error('No fields to update', 400);
        }
        $fields[] = 'updated_at = ?';
        $params[] = Helpers::now();
        $params[] = $id;
        $this->pdo->prepare('UPDATE parties SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Party not found', 404);
        }
        Response::json(['party' => Helpers::partyToApi($row)]);
    }

    private function deleteParty(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'delete');
        $stmt = $this->pdo->prepare('DELETE FROM parties WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function defaultPartyTypes(): array
    {
        return [
            ['not_specified', 'Not specified'],
            ['supplier', 'Supplier'],
            ['hospital', 'Hospital'],
            ['clinic', 'Clinic'],
            ['diagnostic_lab', 'Diagnostic Lab'],
            ['research', 'Research'],
            ['dental', 'Dental'],
            ['other', 'Other'],
        ];
    }

    private function ensurePartyTypes(string $companyId): void
    {
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM party_types WHERE company_id = ?');
        $count->execute([$companyId]);
        if ((int) $count->fetchColumn() > 0) {
            return;
        }
        $now = Helpers::now();
        $stmt = $this->pdo->prepare(
            'INSERT INTO party_types (id, company_id, slug, name, is_builtin, created_at) VALUES (?, ?, ?, ?, 1, ?)'
        );
        foreach ($this->defaultPartyTypes() as [$slug, $name]) {
            $stmt->execute([Helpers::cuid('ptyt'), $companyId, $slug, $name, $now]);
        }
    }

    private function listPartyTypes(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $this->ensurePartyTypes($companyId);
        $stmt = $this->pdo->prepare(
            'SELECT * FROM party_types WHERE company_id = ? ORDER BY is_builtin DESC, name ASC'
        );
        $stmt->execute([$companyId]);
        $types = array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'companyId' => $row['company_id'],
                'slug' => $row['slug'],
                'name' => $row['name'],
                'builtin' => (bool) $row['is_builtin'],
            ];
        }, $stmt->fetchAll());
        Response::json(['types' => $types]);
    }

    private function createPartyType(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        if ($companyId === '' || $name === '') {
            Response::error('Type name required', 400);
        }
        $this->ensurePartyTypes($companyId);
        $slug = Helpers::slug($name);
        if ($slug === '') {
            $slug = 'type_' . substr(Helpers::cuid(''), 0, 6);
        }
        $exists = $this->pdo->prepare('SELECT id FROM party_types WHERE company_id = ? AND slug = ?');
        $exists->execute([$companyId, $slug]);
        if ($exists->fetch()) {
            Response::error('This type already exists', 409);
        }
        $id = Helpers::cuid('ptyt');
        $this->pdo->prepare(
            'INSERT INTO party_types (id, company_id, slug, name, is_builtin, created_at) VALUES (?, ?, ?, ?, 0, ?)'
        )->execute([$id, $companyId, $slug, $name, Helpers::now()]);
        Response::json([
            'type' => [
                'id' => $id,
                'companyId' => $companyId,
                'slug' => $slug,
                'name' => $name,
                'builtin' => false,
            ],
        ], 201);
    }

    private function deletePartyType(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'parties', 'delete');
        $stmt = $this->pdo->prepare('SELECT * FROM party_types WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Type not found', 404);
        }
        if ((int) $row['is_builtin'] === 1) {
            Response::error('Default types cannot be deleted', 400);
        }
        $this->pdo->prepare('DELETE FROM party_types WHERE id = ?')->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function listItemCategories(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $this->syncItemCategories($companyId);
        $stmt = $this->pdo->prepare(
            'SELECT * FROM item_categories WHERE company_id = ? ORDER BY name ASC'
        );
        $stmt->execute([$companyId]);
        $categories = array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'companyId' => $row['company_id'],
                'name' => $row['name'],
            ];
        }, $stmt->fetchAll());
        Response::json(['categories' => $categories]);
    }

    private function syncItemCategories(string $companyId): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT DISTINCT category FROM items WHERE company_id = ? AND category IS NOT NULL AND category <> \'\''
        );
        $stmt->execute([$companyId]);
        $insert = $this->pdo->prepare(
            'INSERT IGNORE INTO item_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)'
        );
        $now = Helpers::now();
        foreach ($stmt->fetchAll() as $row) {
            $name = trim((string) ($row['category'] ?? ''));
            if ($name === '') {
                continue;
            }
            $insert->execute([Helpers::cuid('icat'), $companyId, $name, $now]);
        }
    }

    private function createItemCategory(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        // Category labels are lightweight taxonomy — allow any user who can view items.
        Auth::requirePermission($this->pdo, $user, 'items', 'read');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        if ($companyId === '' || $name === '') {
            Response::error('Category name required', 400);
        }
        $exists = $this->pdo->prepare(
            'SELECT * FROM item_categories WHERE company_id = ? AND name = ?'
        );
        $exists->execute([$companyId, $name]);
        $row = $exists->fetch();
        if ($row) {
            Response::json([
                'category' => [
                    'id' => $row['id'],
                    'companyId' => $row['company_id'],
                    'name' => $row['name'],
                ],
            ]);
            return;
        }
        $id = Helpers::cuid('icat');
        $this->pdo->prepare(
            'INSERT INTO item_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)'
        )->execute([$id, $companyId, $name, Helpers::now()]);
        Response::json([
            'category' => [
                'id' => $id,
                'companyId' => $companyId,
                'name' => $name,
            ],
        ], 201);
    }

    private function deleteItemCategory(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'delete');
        $this->pdo->prepare('DELETE FROM item_categories WHERE id = ?')->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function assertScanId(string $id): void
    {
        if (!preg_match('/^[A-Za-z0-9_-]{4,80}$/', $id)) {
            Response::error('Not found', 404);
        }
    }

    /** @param array<string, mixed> $row */
    private function scanMeta(array $row): array
    {
        return [
            'companyName' => (string) ($row['company_name'] ?? ''),
            'currency' => Helpers::normalizeCurrency(
                isset($row['company_currency']) ? (string) $row['company_currency'] : null,
                isset($row['company_country']) ? (string) $row['company_country'] : null
            ),
        ];
    }

    private function scanProduct(string $id): void
    {
        $this->assertScanId($id);
        $stmt = $this->pdo->prepare(
            'SELECT i.*, c.name AS company_name, c.currency AS company_currency, c.country AS company_country
             FROM items i
             LEFT JOIN companies c ON c.id = i.company_id
             WHERE i.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row || (($row['item_type'] ?? 'product') !== 'product')) {
            Response::error('Not found', 404);
        }
        $meta = $this->scanMeta($row);
        Response::json([
            'kind' => 'product',
            'companyName' => $meta['companyName'],
            'currency' => $meta['currency'],
            'record' => Helpers::itemToApi($row),
            'history' => $this->productScanHistory($id),
        ]);
    }

    private function scanEquipment(string $id): void
    {
        $this->assertScanId($id);
        $stmt = $this->pdo->prepare(
            'SELECT e.*, p.name AS customer_name, c.name AS company_name, c.currency AS company_currency, c.country AS company_country
             FROM equipment e
             LEFT JOIN parties p ON p.id = e.customer_id
             LEFT JOIN companies c ON c.id = e.company_id
             WHERE e.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Not found', 404);
        }
        $meta = $this->scanMeta($row);
        Response::json([
            'kind' => 'equipment',
            'companyName' => $meta['companyName'],
            'currency' => $meta['currency'],
            'record' => Helpers::equipmentToApi($row),
            'history' => $this->equipmentScanHistory($id),
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function productScanHistory(string $itemId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT t.date AS txn_date, t.type AS txn_type, t.number AS txn_number,
                    li.qty, li.rate, li.amount, p.name AS party_name
             FROM line_items li
             INNER JOIN transactions t ON t.id = li.transaction_id
             LEFT JOIN parties p ON p.id = t.party_id
             WHERE li.item_id = ?
             ORDER BY t.date DESC, t.created_at DESC
             LIMIT 50'
        );
        $stmt->execute([$itemId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[] = [
                'date' => (string) ($row['txn_date'] ?? ''),
                'type' => (string) ($row['txn_type'] ?? ''),
                'number' => (string) ($row['txn_number'] ?? ''),
                'qty' => (float) ($row['qty'] ?? 0),
                'rate' => (float) ($row['rate'] ?? 0),
                'amount' => (float) ($row['amount'] ?? 0),
                'partyName' => ($row['party_name'] ?? null) ?: null,
            ];
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function equipmentScanHistory(string $equipmentId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, event_type, summary, from_value, to_value, created_at
             FROM equipment_history
             WHERE equipment_id = ?
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $stmt->execute([$equipmentId]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[] = [
                'id' => (string) $row['id'],
                'eventType' => (string) $row['event_type'],
                'summary' => (string) $row['summary'],
                'fromValue' => ($row['from_value'] ?? null) !== null && $row['from_value'] !== ''
                    ? (string) $row['from_value']
                    : null,
                'toValue' => ($row['to_value'] ?? null) !== null && $row['to_value'] !== ''
                    ? (string) $row['to_value']
                    : null,
                'createdAt' => (string) $row['created_at'],
            ];
        }
        return $out;
    }

    private function insertEquipmentHistory(
        string $equipmentId,
        string $eventType,
        string $summary,
        ?string $fromValue = null,
        ?string $toValue = null
    ): void {
        $this->pdo->prepare(
            'INSERT INTO equipment_history (id, equipment_id, event_type, summary, from_value, to_value, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            Helpers::cuid('eqh'),
            $equipmentId,
            $eventType,
            $summary,
            $fromValue,
            $toValue,
            Helpers::now(),
        ]);
    }

    /**
     * @param array<string, mixed> $before
     * @param array<string, mixed> $body
     */
    private function logEquipmentUpdates(string $equipmentId, array $before, array $body): void
    {
        $labels = [
            'currentStatus' => 'Status',
            'location' => 'Location',
            'customerId' => 'Customer',
            'condition' => 'Condition',
            'name' => 'Name',
            'serialNumber' => 'Serial',
            'model' => 'Model',
            'manufacturer' => 'Manufacturer',
            'category' => 'Category',
            'installDate' => 'Install date',
            'warrantyStart' => 'Machine warranty start',
            'warrantyEnd' => 'Machine warranty end',
            'noMachineWarranty' => 'Machine warranty',
            'serviceWarrantyStart' => 'Service warranty start',
            'serviceWarrantyEnd' => 'Service warranty end',
            'noServiceWarranty' => 'Service warranty',
            'additionalNote' => 'Note',
        ];
        $columns = [
            'currentStatus' => 'current_status',
            'location' => 'location',
            'customerId' => 'customer_id',
            'condition' => 'condition',
            'name' => 'name',
            'serialNumber' => 'serial_number',
            'model' => 'model',
            'manufacturer' => 'manufacturer',
            'category' => 'category',
            'installDate' => 'install_date',
            'warrantyStart' => 'warranty_start',
            'warrantyEnd' => 'warranty_end',
            'noMachineWarranty' => 'no_machine_warranty',
            'serviceWarrantyStart' => 'service_warranty_start',
            'serviceWarrantyEnd' => 'service_warranty_end',
            'noServiceWarranty' => 'no_service_warranty',
            'additionalNote' => 'additional_note',
        ];

        foreach ($columns as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $oldRaw = $before[$col] ?? null;
            if (in_array($api, ['noMachineWarranty', 'noServiceWarranty'], true)) {
                $oldVal = ((int) $oldRaw) ? '1' : '0';
                $newVal = $this->boolVal($body[$api]) ? '1' : '0';
                $oldDisplay = $oldVal === '1' ? 'Off' : 'On';
                $newDisplay = $newVal === '1' ? 'Off' : 'On';
            } elseif ($api === 'currentStatus') {
                $oldVal = strtolower(trim((string) ($oldRaw ?? '')));
                $newVal = $this->normalizeStatus($body[$api]);
                $oldDisplay = $oldVal !== '' ? $oldVal : '—';
                $newDisplay = $newVal;
            } elseif ($api === 'name' || $api === 'serialNumber') {
                $oldVal = trim((string) ($oldRaw ?? ''));
                $newVal = trim((string) $body[$api]);
                $oldDisplay = $oldVal !== '' ? $oldVal : '—';
                $newDisplay = $newVal !== '' ? $newVal : '—';
            } else {
                $oldVal = $oldRaw !== null && $oldRaw !== '' ? (string) $oldRaw : '';
                $nullable = $this->nullable($body[$api]);
                $newVal = $nullable !== null ? (string) $nullable : '';
                $oldDisplay = $oldVal !== '' ? $oldVal : '—';
                $newDisplay = $newVal !== '' ? $newVal : '—';
            }
            if ($oldVal === $newVal) {
                continue;
            }
            if ($api === 'customerId') {
                $oldDisplay = $this->partyNameById($oldVal !== '' ? $oldVal : null) ?? '—';
                $newDisplay = $this->partyNameById($newVal !== '' ? $newVal : null) ?? '—';
            }
            $label = $labels[$api] ?? $api;
            $this->insertEquipmentHistory(
                $equipmentId,
                $api === 'currentStatus' ? 'status_change' : 'field_change',
                $label . ' updated',
                $oldDisplay,
                $newDisplay
            );
        }
    }

    private function partyNameById(?string $id): ?string
    {
        if ($id === null || $id === '') {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT name FROM parties WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? (string) $row['name'] : null;
    }

    private function listItems(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $type = strtolower(trim((string) ($_GET['itemType'] ?? '')));
        if ($type === 'product' || $type === 'service') {
            $stmt = $this->pdo->prepare('SELECT * FROM items WHERE company_id = ? AND item_type = ? ORDER BY name ASC');
            $stmt->execute([$companyId, $type]);
        } else {
            $stmt = $this->pdo->prepare('SELECT * FROM items WHERE company_id = ? ORDER BY name ASC');
            $stmt->execute([$companyId]);
        }
        Response::json(['items' => array_map([Helpers::class, 'itemToApi'], $stmt->fetchAll())]);
    }

    private function createItem(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        if ($companyId === '' || $name === '') {
            Response::error('Invalid item data', 400);
        }
        $id = Helpers::cuid('itm');
        $now = Helpers::now();
        $itemType = strtolower(trim((string) ($body['itemType'] ?? 'product'))) === 'service' ? 'service' : 'product';
        $stockQty = $itemType === 'service' ? 0 : (float) ($body['stockQty'] ?? 0);
        $this->pdo->prepare(
            'INSERT INTO items (id, company_id, name, sku, unit, sale_price, purchase_price, stock_qty, tax_percent, category, item_type, image_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $companyId, $name,
            $this->nullable($body['sku'] ?? null),
            trim((string) ($body['unit'] ?? 'pcs')) ?: 'pcs',
            (float) ($body['salePrice'] ?? 0),
            (float) ($body['purchasePrice'] ?? 0),
            $stockQty,
            (float) ($body['taxPercent'] ?? 18),
            $this->nullable($body['category'] ?? null),
            $itemType,
            $this->nullable($body['imageUrl'] ?? null),
            $now, $now,
        ]);
        $stmt = $this->pdo->prepare('SELECT * FROM items WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['item' => Helpers::itemToApi($stmt->fetch())], 201);
    }

    private function bulkCreateItems(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $items = $body['items'] ?? [];
        if ($companyId === '' || !is_array($items)) {
            Response::error('companyId and items[] required', 400);
        }
        if (count($items) > 2000) {
            Response::error('Import is limited to 2000 rows', 400);
        }
        $created = 0;
        $skipped = 0;
        $failed = 0;
        $errors = [];
        $now = Helpers::now();
        $stmt = $this->pdo->prepare(
            'INSERT INTO items (id, company_id, name, sku, unit, sale_price, purchase_price, stock_qty, tax_percent, category, item_type, image_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $this->pdo->beginTransaction();
        try {
            foreach ($items as $index => $raw) {
                if (!is_array($raw)) {
                    $failed += 1;
                    $errors[] = 'Row ' . ((int) $index + 1) . ': invalid item';
                    continue;
                }
                $name = trim((string) ($raw['name'] ?? ''));
                if ($name === '') {
                    $skipped += 1;
                    continue;
                }
                if (strlen($name) < 2) {
                    $failed += 1;
                    $errors[] = 'Row ' . ((int) $index + 1) . ': name must be at least 2 characters';
                    continue;
                }
                $nums = [
                    'salePrice' => $raw['salePrice'] ?? 0,
                    'purchasePrice' => $raw['purchasePrice'] ?? 0,
                    'stockQty' => $raw['stockQty'] ?? 0,
                    'taxPercent' => $raw['taxPercent'] ?? 18,
                ];
                $invalid = false;
                foreach ($nums as $label => $value) {
                    $n = (float) $value;
                    if ($n < 0) {
                        $failed += 1;
                        $errors[] = 'Row ' . ((int) $index + 1) . ': ' . $label . ' must be >= 0';
                        $invalid = true;
                        break;
                    }
                }
                if ($invalid) {
                    continue;
                }
                $itemType = strtolower(trim((string) ($raw['itemType'] ?? 'product'))) === 'service' ? 'service' : 'product';
                $stockQty = $itemType === 'service' ? 0 : (float) ($raw['stockQty'] ?? 0);
                $stmt->execute([
                    Helpers::cuid('itm'),
                    $companyId,
                    $name,
                    $this->nullable($raw['sku'] ?? null),
                    trim((string) ($raw['unit'] ?? 'pcs')) ?: 'pcs',
                    (float) ($raw['salePrice'] ?? 0),
                    (float) ($raw['purchasePrice'] ?? 0),
                    $stockQty,
                    (float) ($raw['taxPercent'] ?? 18),
                    $this->nullable($raw['category'] ?? null),
                    $itemType,
                    $this->nullable($raw['imageUrl'] ?? null),
                    $now,
                    $now,
                ]);
                $created += 1;
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Bulk import failed', 500);
        }
        Response::json([
            'created' => $created,
            'skipped' => $skipped,
            'failed' => $failed,
            'errors' => $errors,
        ]);
    }

    private function updateItem(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'update');
        $body = Helpers::body();
        $map = [
            'name' => 'name',
            'sku' => 'sku',
            'unit' => 'unit',
            'salePrice' => 'sale_price',
            'purchasePrice' => 'purchase_price',
            'stockQty' => 'stock_qty',
            'taxPercent' => 'tax_percent',
            'category' => 'category',
            'itemType' => 'item_type',
            'imageUrl' => 'image_url',
        ];
        $fields = [];
        $params = [];
        foreach ($map as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $fields[] = $col . ' = ?';
            if (in_array($api, ['sku', 'category', 'imageUrl'], true)) {
                $params[] = $this->nullable($body[$api]);
            } elseif (in_array($api, ['salePrice', 'purchasePrice', 'stockQty', 'taxPercent'], true)) {
                $params[] = (float) $body[$api];
            } elseif ($api === 'itemType') {
                $params[] = strtolower(trim((string) $body[$api])) === 'service' ? 'service' : 'product';
            } else {
                $params[] = trim((string) $body[$api]);
            }
        }
        if (!$fields) {
            Response::error('No fields to update', 400);
        }
        $fields[] = 'updated_at = ?';
        $params[] = Helpers::now();
        $params[] = $id;
        $this->pdo->prepare('UPDATE items SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        $stmt = $this->pdo->prepare('SELECT * FROM items WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Item not found', 404);
        }
        Response::json(['item' => Helpers::itemToApi($row)]);
    }

    private function deleteItem(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'items', 'delete');
        $this->pdo->prepare('DELETE FROM items WHERE id = ?')->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function listEquipment(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'equipment', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $stmt = $this->pdo->prepare(
            'SELECT e.*, p.name AS customer_name
             FROM equipment e
             LEFT JOIN parties p ON p.id = e.customer_id
             WHERE e.company_id = ?
             ORDER BY e.created_at DESC'
        );
        $stmt->execute([$companyId]);
        Response::json(['equipment' => array_map([Helpers::class, 'equipmentToApi'], $stmt->fetchAll())]);
    }

    private function createEquipment(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'equipment', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? $_GET['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $serial = trim((string) ($body['serialNumber'] ?? ''));
        if ($companyId === '' || $name === '' || $serial === '') {
            Response::error('name and serialNumber are required', 400);
        }
        if ($this->serialTaken($companyId, $serial, null)) {
            Response::error('Serial number already taken. Please check.', 409);
        }
        $id = Helpers::cuid('eqp');
        $now = Helpers::now();
        $co = $this->pdo->prepare('SELECT asset_tag_start FROM companies WHERE id = ?');
        $co->execute([$companyId]);
        $coRow = $co->fetch();
        $assetTag = Helpers::nextAssetTag(
            $this->pdo,
            $companyId,
            $coRow['asset_tag_start'] ?? 'EQ-0001'
        );
        $warrantyOff = $this->boolVal($body['noMachineWarranty'] ?? false);
        $serviceOff = $this->boolVal($body['noServiceWarranty'] ?? false);
        $status = $this->normalizeStatus($body['currentStatus'] ?? 'in_service');
        try {
            $this->pdo->prepare(
                'INSERT INTO equipment (
                    id, company_id, asset_tag, name, model, manufacturer, category, serial_number,
                    customer_id, location, install_date, warranty_start, warranty_end, no_machine_warranty,
                    service_warranty_start, service_warranty_end, no_service_warranty, `condition`,
                    current_status, additional_note, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $id,
                $companyId,
                $assetTag,
                $name,
                $this->nullable($body['model'] ?? null),
                $this->nullable($body['manufacturer'] ?? null),
                $this->nullable($body['category'] ?? null),
                $serial,
                $this->nullable($body['customerId'] ?? null),
                $this->nullable($body['location'] ?? null),
                $this->nullable($body['installDate'] ?? null),
                $warrantyOff ? null : $this->nullable($body['warrantyStart'] ?? null),
                $warrantyOff ? null : $this->nullable($body['warrantyEnd'] ?? null),
                $warrantyOff ? 1 : 0,
                $serviceOff ? null : $this->nullable($body['serviceWarrantyStart'] ?? null),
                $serviceOff ? null : $this->nullable($body['serviceWarrantyEnd'] ?? null),
                $serviceOff ? 1 : 0,
                $this->nullable($body['condition'] ?? null),
                $status,
                $this->nullable($body['additionalNote'] ?? null),
                $now,
                $now,
            ]);
        } catch (PDOException $e) {
            if (stripos($e->getMessage(), 'Duplicate') !== false) {
                Response::error('Serial number already taken. Please check.', 409);
            }
            throw $e;
        }
        $this->insertEquipmentHistory($id, 'created', 'Equipment registered', null, $name . ' · ' . $serial);
        Response::json(['equipment' => $this->fetchEquipment($id)], 201);
    }

    private function updateEquipment(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'equipment', 'update');
        $body = Helpers::body();
        $existing = $this->pdo->prepare('SELECT * FROM equipment WHERE id = ?');
        $existing->execute([$id]);
        $row = $existing->fetch();
        if (!$row) {
            Response::error('Equipment not found', 404);
        }
        $companyId = (string) $row['company_id'];
        if (array_key_exists('serialNumber', $body)) {
            $serial = trim((string) $body['serialNumber']);
            if ($serial === '') {
                Response::error('serialNumber is required', 400);
            }
            if ($this->serialTaken($companyId, $serial, $id)) {
                Response::error('Serial number already taken. Please check.', 409);
            }
        }
        $map = [
            'name' => 'name',
            'model' => 'model',
            'manufacturer' => 'manufacturer',
            'category' => 'category',
            'serialNumber' => 'serial_number',
            'customerId' => 'customer_id',
            'location' => 'location',
            'installDate' => 'install_date',
            'warrantyStart' => 'warranty_start',
            'warrantyEnd' => 'warranty_end',
            'noMachineWarranty' => 'no_machine_warranty',
            'serviceWarrantyStart' => 'service_warranty_start',
            'serviceWarrantyEnd' => 'service_warranty_end',
            'noServiceWarranty' => 'no_service_warranty',
            'condition' => 'condition',
            'currentStatus' => 'current_status',
            'additionalNote' => 'additional_note',
        ];
        $fields = [];
        $params = [];
        foreach ($map as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $fields[] = ($col === 'condition' ? '`condition`' : $col) . ' = ?';
            if (in_array($api, ['noMachineWarranty', 'noServiceWarranty'], true)) {
                $params[] = $this->boolVal($body[$api]) ? 1 : 0;
            } elseif ($api === 'currentStatus') {
                $params[] = $this->normalizeStatus($body[$api]);
            } elseif ($api === 'name' || $api === 'serialNumber') {
                $params[] = trim((string) $body[$api]);
            } else {
                $params[] = $this->nullable($body[$api]);
            }
        }
        if (!$fields) {
            Response::error('No fields to update', 400);
        }
        if (!empty($body['noMachineWarranty'])) {
            $fields[] = 'warranty_start = ?';
            $params[] = null;
            $fields[] = 'warranty_end = ?';
            $params[] = null;
        }
        if (!empty($body['noServiceWarranty'])) {
            $fields[] = 'service_warranty_start = ?';
            $params[] = null;
            $fields[] = 'service_warranty_end = ?';
            $params[] = null;
        }
        $fields[] = 'updated_at = ?';
        $params[] = Helpers::now();
        $params[] = $id;
        try {
            $this->pdo->prepare('UPDATE equipment SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        } catch (PDOException $e) {
            if (stripos($e->getMessage(), 'Duplicate') !== false) {
                Response::error('Serial number already taken. Please check.', 409);
            }
            throw $e;
        }
        $this->logEquipmentUpdates($id, $row, $body);
        Response::json(['equipment' => $this->fetchEquipment($id)]);
    }

    private function fetchEquipment(string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT e.*, p.name AS customer_name
             FROM equipment e
             LEFT JOIN parties p ON p.id = e.customer_id
             WHERE e.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Equipment not found', 404);
        }
        return Helpers::equipmentToApi($row);
    }

    private function serialTaken(string $companyId, string $serial, ?string $exceptId): bool
    {
        $sql = 'SELECT id FROM equipment WHERE company_id = ? AND serial_number = ?';
        $params = [$companyId, $serial];
        if ($exceptId) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        $stmt = $this->pdo->prepare($sql . ' LIMIT 1');
        $stmt->execute($params);
        return (bool) $stmt->fetch();
    }

    private function normalizeStatus($value): string
    {
        $allowed = ['in_service', 'in_repair', 'in_storage', 'decommissioned', 'disposed'];
        $status = strtolower(trim((string) $value));
        return in_array($status, $allowed, true) ? $status : 'in_service';
    }

    private function boolVal($value): bool
    {
        return $value === true || $value === 1 || $value === '1' || $value === 'true';
    }

    private function listServiceCalls(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'service_calls', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $stmt = $this->pdo->prepare(
            'SELECT * FROM service_calls WHERE company_id = ? ORDER BY created_at DESC'
        );
        $stmt->execute([$companyId]);
        Response::json(['serviceCalls' => array_map([Helpers::class, 'serviceCallToApi'], $stmt->fetchAll())]);
    }

    private function getServiceCall(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'service_calls', 'read');
        Response::json(['serviceCall' => $this->fetchServiceCall($id)]);
    }

    private function createServiceCall(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'service_calls', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? $_GET['companyId'] ?? '');
        $customerId = trim((string) ($body['customerId'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        if ($companyId === '' || $customerId === '' || $description === '') {
            Response::error('customerId and description are required', 400);
        }
        $customer = $this->pdo->prepare('SELECT id, name FROM parties WHERE id = ? AND company_id = ? LIMIT 1');
        $customer->execute([$customerId, $companyId]);
        $customerRow = $customer->fetch();
        if (!$customerRow) {
            Response::error('Customer not found', 404);
        }

        $equipmentId = $this->nullable($body['equipmentId'] ?? null);
        $equipmentName = $this->nullable($body['equipmentName'] ?? null);
        if ($equipmentId) {
            $eq = $this->pdo->prepare(
                'SELECT id, name, asset_tag, serial_number FROM equipment WHERE id = ? AND company_id = ? LIMIT 1'
            );
            $eq->execute([$equipmentId, $companyId]);
            $eqRow = $eq->fetch();
            if (!$eqRow) {
                Response::error('Equipment not found', 404);
            }
            if (!$equipmentName) {
                $equipmentName = trim((string) $eqRow['name']);
                if (!empty($eqRow['asset_tag'])) {
                    $equipmentName .= ' · ' . $eqRow['asset_tag'];
                }
            }
        }

        $assignedUserId = $this->nullable($body['assignedUserId'] ?? null);
        $assignedName = $this->nullable($body['assignedName'] ?? null);
        if ($assignedUserId && !$assignedName) {
            $u = $this->pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
            $u->execute([$assignedUserId]);
            $uRow = $u->fetch();
            if ($uRow) {
                $assignedName = $uRow['name'];
            }
        }

        $status = $this->normalizeServiceCallStatus($body['status'] ?? 'open');
        if ($status === 'open' && ($assignedUserId || $assignedName)) {
            $status = 'assigned';
        }

        $id = Helpers::cuid('scall');
        $now = Helpers::now();
        $callNo = Helpers::nextServiceCallNo($this->pdo, $companyId);
        $type = $this->normalizeServiceCallType($body['type'] ?? 'Repair');
        $priority = $this->normalizeServiceCallPriority($body['priority'] ?? 'normal');
        $completedAt = in_array($status, ['done', 'closed'], true) ? $now : null;

        $this->pdo->prepare(
            'INSERT INTO service_calls (
                id, company_id, call_no, customer_id, customer_name, equipment_id, equipment_name,
                type, priority, status, description, assigned_user_id, assigned_name, scheduled_for,
                notes, invoice_doc_id, completed_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id,
            $companyId,
            $callNo,
            $customerId,
            $customerRow['name'],
            $equipmentId,
            $equipmentName,
            $type,
            $priority,
            $status,
            $description,
            $assignedUserId,
            $assignedName,
            $this->nullable($body['scheduledFor'] ?? null),
            $this->nullable($body['notes'] ?? null),
            $this->nullable($body['invoiceDocId'] ?? null),
            $completedAt,
            $now,
            $now,
        ]);

        Response::json(['serviceCall' => $this->fetchServiceCall($id)], 201);
    }

    private function updateServiceCall(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'service_calls', 'update');
        $body = Helpers::body();
        $existing = $this->pdo->prepare('SELECT * FROM service_calls WHERE id = ?');
        $existing->execute([$id]);
        $row = $existing->fetch();
        if (!$row) {
            Response::error('Service call not found', 404);
        }
        $companyId = (string) $row['company_id'];
        $fields = [];
        $params = [];

        if (array_key_exists('customerId', $body)) {
            $customerId = trim((string) $body['customerId']);
            if ($customerId === '') {
                Response::error('customerId is required', 400);
            }
            $customer = $this->pdo->prepare('SELECT id, name FROM parties WHERE id = ? AND company_id = ? LIMIT 1');
            $customer->execute([$customerId, $companyId]);
            $customerRow = $customer->fetch();
            if (!$customerRow) {
                Response::error('Customer not found', 404);
            }
            $fields[] = 'customer_id = ?';
            $params[] = $customerId;
            $fields[] = 'customer_name = ?';
            $params[] = $customerRow['name'];
        }

        if (array_key_exists('equipmentId', $body)) {
            $equipmentId = $this->nullable($body['equipmentId']);
            $equipmentName = $this->nullable($body['equipmentName'] ?? null);
            if ($equipmentId) {
                $eq = $this->pdo->prepare(
                    'SELECT id, name, asset_tag FROM equipment WHERE id = ? AND company_id = ? LIMIT 1'
                );
                $eq->execute([$equipmentId, $companyId]);
                $eqRow = $eq->fetch();
                if (!$eqRow) {
                    Response::error('Equipment not found', 404);
                }
                if (!$equipmentName) {
                    $equipmentName = trim((string) $eqRow['name']);
                    if (!empty($eqRow['asset_tag'])) {
                        $equipmentName .= ' · ' . $eqRow['asset_tag'];
                    }
                }
            } else {
                $equipmentName = null;
            }
            $fields[] = 'equipment_id = ?';
            $params[] = $equipmentId;
            $fields[] = 'equipment_name = ?';
            $params[] = $equipmentName;
        } elseif (array_key_exists('equipmentName', $body)) {
            $fields[] = 'equipment_name = ?';
            $params[] = $this->nullable($body['equipmentName']);
        }

        if (array_key_exists('type', $body)) {
            $fields[] = 'type = ?';
            $params[] = $this->normalizeServiceCallType($body['type']);
        }
        if (array_key_exists('priority', $body)) {
            $fields[] = 'priority = ?';
            $params[] = $this->normalizeServiceCallPriority($body['priority']);
        }
        if (array_key_exists('description', $body)) {
            $description = trim((string) $body['description']);
            if ($description === '') {
                Response::error('description is required', 400);
            }
            $fields[] = 'description = ?';
            $params[] = $description;
        }
        if (array_key_exists('assignedUserId', $body) || array_key_exists('assignedName', $body)) {
            $assignedUserId = array_key_exists('assignedUserId', $body)
                ? $this->nullable($body['assignedUserId'])
                : ($row['assigned_user_id'] ?? null);
            $assignedName = array_key_exists('assignedName', $body)
                ? $this->nullable($body['assignedName'])
                : ($row['assigned_name'] ?? null);
            if ($assignedUserId && !$assignedName) {
                $u = $this->pdo->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
                $u->execute([$assignedUserId]);
                $uRow = $u->fetch();
                if ($uRow) {
                    $assignedName = $uRow['name'];
                }
            }
            $fields[] = 'assigned_user_id = ?';
            $params[] = $assignedUserId;
            $fields[] = 'assigned_name = ?';
            $params[] = $assignedName;
        }
        if (array_key_exists('scheduledFor', $body)) {
            $fields[] = 'scheduled_for = ?';
            $params[] = $this->nullable($body['scheduledFor']);
        }
        if (array_key_exists('notes', $body)) {
            $fields[] = 'notes = ?';
            $params[] = $this->nullable($body['notes']);
        }
        if (array_key_exists('invoiceDocId', $body)) {
            $fields[] = 'invoice_doc_id = ?';
            $params[] = $this->nullable($body['invoiceDocId']);
        }

        $status = null;
        if (array_key_exists('status', $body)) {
            $status = $this->normalizeServiceCallStatus($body['status']);
            $fields[] = 'status = ?';
            $params[] = $status;
        }

        if ($status !== null) {
            if (in_array($status, ['done', 'closed'], true) && empty($row['completed_at'])) {
                $fields[] = 'completed_at = ?';
                $params[] = Helpers::now();
            }
            if ($status === 'open' || $status === 'assigned' || $status === 'in_progress') {
                $fields[] = 'completed_at = ?';
                $params[] = null;
            }
        }

        if (!$fields) {
            Response::json(['serviceCall' => $this->fetchServiceCall($id)]);
        }

        $fields[] = 'updated_at = ?';
        $params[] = Helpers::now();
        $params[] = $id;
        $this->pdo->prepare('UPDATE service_calls SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        Response::json(['serviceCall' => $this->fetchServiceCall($id)]);
    }

    private function fetchServiceCall(string $id): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM service_calls WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Service call not found', 404);
        }
        return Helpers::serviceCallToApi($row);
    }

    private function normalizeServiceCallStatus($value): string
    {
        $allowed = ['open', 'assigned', 'in_progress', 'done', 'closed'];
        $status = strtolower(trim((string) $value));
        $status = str_replace([' ', '-'], '_', $status);
        if ($status === 'inprogress') {
            $status = 'in_progress';
        }
        return in_array($status, $allowed, true) ? $status : 'open';
    }

    private function normalizeServiceCallType($value): string
    {
        $allowed = ['Repair', 'Maintenance', 'Installation', 'Other'];
        $type = trim((string) $value);
        foreach ($allowed as $opt) {
            if (strcasecmp($opt, $type) === 0) {
                return $opt;
            }
        }
        return 'Repair';
    }

    private function normalizeServiceCallPriority($value): string
    {
        $priority = strtolower(trim((string) $value));
        return $priority === 'high' ? 'high' : 'normal';
    }

    private function listAccounts(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'payments', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM payment_types WHERE company_id = ? ORDER BY name ASC');
        $stmt->execute([$companyId]);
        Response::json(['accounts' => array_map([Helpers::class, 'paymentToApi'], $stmt->fetchAll())]);
    }

    private function createAccount(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'payments', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $kind = (string) ($body['kind'] ?? '');
        $allowed = ['cash', 'bank', 'cheque', 'upi', 'loan', 'other'];
        if ($companyId === '' || $name === '' || !in_array($kind, $allowed, true)) {
            Response::error('Invalid account data', 400);
        }
        $id = Helpers::cuid('pay');
        $now = Helpers::now();
        $this->pdo->prepare(
            'INSERT INTO payment_types (id, company_id, name, kind, opening_balance, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $companyId, $name, $kind, (float) ($body['openingBalance'] ?? 0), $now, $now]);
        $stmt = $this->pdo->prepare('SELECT * FROM payment_types WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['account' => Helpers::paymentToApi($stmt->fetch())], 201);
    }

    private function listTransactions(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $type = isset($_GET['type']) ? (string) $_GET['type'] : '';
        if ($type !== '') {
            Auth::requirePermission($this->pdo, $user, $this->txnDirectory($type), 'read');
        } else {
            // Unfiltered list: allow if user can read any txn-related directory.
            $ok = Rbac::isSuperAdmin($user)
                || Rbac::can($user['_permissions'] ?? [], 'payments', 'read')
                || Rbac::can($user['_permissions'] ?? [], 'new_invoice', 'read')
                || Rbac::can($user['_permissions'] ?? [], 'purchase_bills', 'read');
            if (!$ok) {
                Response::error('Forbidden', 403);
            }
        }
        if ($type !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT * FROM transactions WHERE company_id = ? AND type = ? ORDER BY date DESC, created_at DESC'
            );
            $stmt->execute([$companyId, $type]);
        } else {
            $stmt = $this->pdo->prepare(
                'SELECT * FROM transactions WHERE company_id = ? ORDER BY date DESC, created_at DESC'
            );
            $stmt->execute([$companyId]);
        }
        $rows = $stmt->fetchAll();
        if ($type === '' || $type === 'sale') {
            $docsApi = new Docs($this->pdo, $this->config);
            foreach ($rows as $row) {
                if (($row['type'] ?? '') === 'sale') {
                    $docsApi->ensureConfirmedSaleOrder($row, $this->linesFor($row['id']));
                }
            }
        }
        $saleOrders = ($type === '' || $type === 'sale')
            ? $this->saleOrdersForInvoices($companyId)
            : [];
        $out = [];
        foreach ($rows as $row) {
            $api = Helpers::txnToApi($row, $this->linesFor($row['id']));
            if (($row['type'] ?? '') === 'sale') {
                $link = $saleOrders[$row['id']] ?? null;
                $api['saleOrderId'] = $link['id'] ?? null;
                $api['saleOrderNumber'] = $link['number'] ?? null;
            }
            $out[] = $api;
        }
        Response::json(['transactions' => $out]);
    }

    private function getTransaction(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Transaction not found', 404);
        }
        Auth::requirePermission($this->pdo, $user, $this->txnDirectory((string) $row['type']), 'read');
        if (($row['type'] ?? '') === 'sale') {
            (new Docs($this->pdo, $this->config))->ensureConfirmedSaleOrder($row, $this->linesFor($id));
        }
        $api = Helpers::txnToApi($row, $this->linesFor($id));
        if (($row['type'] ?? '') === 'sale') {
            $saleOrders = $this->saleOrdersForInvoices((string) $row['company_id']);
            $link = $saleOrders[$row['id']] ?? null;
            $api['saleOrderId'] = $link['id'] ?? null;
            $api['saleOrderNumber'] = $link['number'] ?? null;
        }
        Response::json(['transaction' => $api]);
    }

    /**
     * Sale invoice id => the sale order that became this invoice
     * (sale order ? delivery ? invoice).
     *
     * @return array<string, array{id: string, number: string}>
     */
    private function saleOrdersForInvoices(string $companyId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, doc_type, number, converted_to_id
             FROM docs
             WHERE company_id = ? AND doc_type IN (\'quotation\', \'sale_order\', \'delivery\')'
        );
        $stmt->execute([$companyId]);
        $parentOf = [];
        foreach ($stmt->fetchAll() as $row) {
            $childId = (string) ($row['converted_to_id'] ?? '');
            if ($childId === '') {
                continue;
            }
            $parentOf[$childId] = $row;
        }

        $orders = [];
        foreach (array_keys($parentOf) as $childId) {
            $currentId = (string) $childId;
            $order = null;
            for ($guard = 0; $guard < 6 && isset($parentOf[$currentId]); $guard++) {
                $parent = $parentOf[$currentId];
                if (($parent['doc_type'] ?? '') === 'sale_order') {
                    $order = $parent;
                    break;
                }
                $currentId = (string) $parent['id'];
            }
            if ($order) {
                $orders[(string) $childId] = [
                    'id' => (string) $order['id'],
                    'number' => (string) $order['number'],
                ];
            }
        }
        return $orders;
    }

    private function deleteTransaction(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT type FROM transactions WHERE id = ?');
        $row->execute([$id]);
        $txn = $row->fetch();
        if (!$txn) { Response::error('Transaction not found', 404); }
        Auth::requirePermission($this->pdo, $user, $this->txnDirectory((string)$txn['type']), 'delete');
        $stmt = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Transaction not found', 404);
        }
        $type = (string) $row['type'];
        $lines = $this->linesFor($id);
        $now = Helpers::now();
        try {
            $this->pdo->beginTransaction();
            if (($type === 'sale' || $type === 'purchase') && (int) ($row['stock_effect'] ?? 1) === 1) {
                $stockStmt = $this->pdo->prepare('UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?');
                foreach ($lines as $line) {
                    $itemId = $line['item_id'] ?? null;
                    if (!$itemId) {
                        continue;
                    }
                    $qty = (float) ($line['qty'] ?? 0);
                    $delta = $type === 'sale' ? $qty : -$qty;
                    $stockStmt->execute([$delta, $now, $itemId]);
                }
            }
            $this->pdo->prepare('DELETE FROM line_items WHERE transaction_id = ?')->execute([$id]);
            $this->pdo->prepare('DELETE FROM transactions WHERE id = ?')->execute([$id]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to delete transaction', 500, $e->getMessage());
        }
        Response::json(['ok' => true]);
    }

    private function createTransaction(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $body = Helpers::body();
        $type = (string) ($body['type'] ?? '');
        Auth::requirePermission($this->pdo, $user, $this->txnDirectory($type), 'create');
        $companyId = (string) ($body['companyId'] ?? '');
        $type = (string) ($body['type'] ?? '');
        $number = trim((string) ($body['number'] ?? ''));
        $date = (string) ($body['date'] ?? '');
        $allowed = ['sale', 'purchase', 'payment_in', 'payment_out'];
        if ($companyId === '' || $number === '' || $date === '' || !in_array($type, $allowed, true)) {
            Response::error('Invalid transaction data', 400);
        }
        $lines = is_array($body['lines'] ?? null) ? $body['lines'] : [];
        $id = Helpers::cuid('txn');
        $now = Helpers::now();

        try {
            $this->pdo->beginTransaction();
            $this->pdo->prepare(
                'INSERT INTO transactions (id, company_id, type, number, date, party_id, payment_type_id, notes, subtotal, tax_total, grand_total, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $id, $companyId, $type, $number, $date,
                $this->nullable($body['partyId'] ?? null),
                $this->nullable($body['paymentTypeId'] ?? null),
                $this->nullable($body['notes'] ?? null),
                (float) ($body['subtotal'] ?? 0),
                (float) ($body['taxTotal'] ?? 0),
                (float) ($body['grandTotal'] ?? 0),
                $now, $now,
            ]);

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO line_items (id, company_id, transaction_id, item_id, name, qty, rate, tax_percent, amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stockStmt = $this->pdo->prepare('UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?');

            foreach ($lines as $line) {
                $lineId = Helpers::cuid('li');
                $itemId = $this->nullable($line['itemId'] ?? null);
                $qty = (float) ($line['qty'] ?? 0);
                $lineStmt->execute([
                    $lineId, $companyId, $id, $itemId,
                    trim((string) ($line['name'] ?? '')),
                    $qty,
                    (float) ($line['rate'] ?? 0),
                    (float) ($line['taxPercent'] ?? 0),
                    (float) ($line['amount'] ?? 0),
                ]);
                if ($itemId && ($type === 'sale' || $type === 'purchase')) {
                    $delta = $type === 'sale' ? -$qty : $qty;
                    $stockStmt->execute([$delta, $now, $itemId]);
                }
            }
            if ($type === 'sale') {
                $saved = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
                $saved->execute([$id]);
                $savedRow = $saved->fetch();
                if ($savedRow) {
                    (new Docs($this->pdo, $this->config))->ensureConfirmedSaleOrder(
                        $savedRow,
                        $this->linesFor($id)
                    );
                }
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to create transaction', 500, $e->getMessage());
        }

        $this->getTransaction($id);
    }

    private function updateTransaction(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT type FROM transactions WHERE id = ?');
        $row->execute([$id]);
        $txn = $row->fetch();
        if (!$txn) { Response::error('Transaction not found', 404); }
        Auth::requirePermission($this->pdo, $user, $this->txnDirectory((string)$txn['type']), 'update');
        $body = Helpers::body();

        $stmt = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Transaction not found', 404);
        }
        $type = (string) $row['type'];
        if ($type !== 'sale' && $type !== 'purchase') {
            Response::error('Only sale invoices and purchase bills can be edited', 400);
        }
        $date = (string) ($body['date'] ?? $row['date']);
        if ($date === '') {
            Response::error('Date required', 400);
        }
        $lines = is_array($body['lines'] ?? null) ? $body['lines'] : [];
        if (!$lines) {
            Response::error('Add at least one line', 400);
        }
        $now = Helpers::now();
        $oldLines = $this->linesFor($id);
        $affectsStock = (int) ($row['stock_effect'] ?? 1) === 1;

        try {
            $this->pdo->beginTransaction();
            $this->pdo->prepare(
                'UPDATE transactions SET date = ?, party_id = ?, payment_type_id = ?, notes = ?, subtotal = ?, tax_total = ?, grand_total = ?, updated_at = ? WHERE id = ?'
            )->execute([
                $date,
                $this->nullable($body['partyId'] ?? $row['party_id']),
                $this->nullable($body['paymentTypeId'] ?? null),
                $this->nullable($body['notes'] ?? null),
                (float) ($body['subtotal'] ?? 0),
                (float) ($body['taxTotal'] ?? 0),
                (float) ($body['grandTotal'] ?? 0),
                $now,
                $id,
            ]);

            $stockStmt = $this->pdo->prepare('UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?');
            if ($affectsStock) {
                foreach ($oldLines as $line) {
                    $itemId = $line['item_id'] ?? null;
                    if (!$itemId) {
                        continue;
                    }
                    $qty = (float) ($line['qty'] ?? 0);
                    $stockStmt->execute([$type === 'sale' ? $qty : -$qty, $now, $itemId]);
                }
            }
            $this->pdo->prepare('DELETE FROM line_items WHERE transaction_id = ?')->execute([$id]);

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO line_items (id, company_id, transaction_id, item_id, name, qty, rate, tax_percent, amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($lines as $line) {
                $itemId = $this->nullable($line['itemId'] ?? null);
                $qty = (float) ($line['qty'] ?? 0);
                $lineStmt->execute([
                    Helpers::cuid('li'),
                    $row['company_id'],
                    $id,
                    $itemId,
                    trim((string) ($line['name'] ?? '')),
                    $qty,
                    (float) ($line['rate'] ?? 0),
                    (float) ($line['taxPercent'] ?? 0),
                    (float) ($line['amount'] ?? 0),
                ]);
                if ($affectsStock && $itemId) {
                    $stockStmt->execute([$type === 'sale' ? -$qty : $qty, $now, $itemId]);
                }
            }

            $freshStmt = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
            $freshStmt->execute([$id]);
            $fresh = $freshStmt->fetch();
            if ($fresh && $type === 'sale') {
                (new Docs($this->pdo, $this->config))->syncDirectSaleOrder($fresh, $this->linesFor($id));
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to update transaction', 500, $e->getMessage());
        }

        $this->getTransaction($id);
    }

    private function listMaster(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'settings', 'read');
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $kind = isset($_GET['kind']) ? (string) $_GET['kind'] : '';
        if ($kind !== '') {
            $stmt = $this->pdo->prepare(
                'SELECT * FROM master_data WHERE company_id = ? AND kind = ? AND is_active = 1 ORDER BY sort_order, label'
            );
            $stmt->execute([$companyId, $kind]);
        } else {
            $stmt = $this->pdo->prepare(
                'SELECT * FROM master_data WHERE company_id = ? AND is_active = 1 ORDER BY kind, sort_order, label'
            );
            $stmt->execute([$companyId]);
        }
        $rows = array_map(static function (array $row): array {
            return [
                'id' => $row['id'],
                'companyId' => $row['company_id'],
                'kind' => $row['kind'],
                'code' => $row['code'],
                'label' => $row['label'],
                'value' => $row['value'],
                'sortOrder' => (int) $row['sort_order'],
            ];
        }, $stmt->fetchAll());
        Response::json(['masterData' => $rows]);
    }

    private function createMaster(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'settings', 'create');
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $kind = trim((string) ($body['kind'] ?? ''));
        $code = trim((string) ($body['code'] ?? ''));
        $label = trim((string) ($body['label'] ?? ''));
        if ($companyId === '' || $kind === '' || $code === '' || $label === '') {
            Response::error('Invalid master data', 400);
        }
        $id = Helpers::cuid('md');
        $this->pdo->prepare(
            'INSERT INTO master_data (id, company_id, kind, code, label, value, sort_order, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
        )->execute([
            $id, $companyId, $kind, $code, $label,
            $this->nullable($body['value'] ?? null),
            (int) ($body['sortOrder'] ?? 0),
            Helpers::now(),
        ]);
        Response::json(['masterData' => [
            'id' => $id,
            'companyId' => $companyId,
            'kind' => $kind,
            'code' => $code,
            'label' => $label,
            'value' => $body['value'] ?? null,
            'sortOrder' => (int) ($body['sortOrder'] ?? 0),
        ]], 201);
    }

    private function listUsers(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'users', 'read');
        $rows = $this->pdo->query('SELECT * FROM users ORDER BY name ASC')->fetchAll();
        Response::json(['users' => array_map(fn($r) => Roles::publicUserFromPdo($this->pdo, $r), $rows)]);
    }

    private function createUser(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requirePermission($this->pdo, $user, 'users', 'create');
        $body = Helpers::body();
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $role = (string) ($body['role'] ?? '');
        if ($username === '' || strlen($password) < 4 || $name === '' || !in_array($role, Roles::ALL, true)) {
            Response::error('Invalid user data', 400);
        }
        $exists = $this->pdo->prepare('SELECT id FROM users WHERE username = ?');
        $exists->execute([$username]);
        if ($exists->fetch()) {
            Response::error('Username already exists', 409);
        }
        $id = Helpers::cuid('usr');
        $now = Helpers::now();
        $userType = (int) ($body['userType'] ?? $body['user_type'] ?? 0);
        $this->pdo->prepare(
            'INSERT INTO users (id, username, password_hash, name, phone, email, role, user_type, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([
            $id, $username, password_hash($password, PASSWORD_BCRYPT), $name,
            $this->nullable($body['phone'] ?? null),
            $this->nullable($body['email'] ?? null),
            $role, $userType, $now, $now,
        ]);

        $roleName = Rbac::legacyRoleName($role);
        $roleRow = $this->pdo->prepare('SELECT id FROM roles WHERE name = ? LIMIT 1');
        $roleRow->execute([$roleName]);
        $roleId = $roleRow->fetchColumn();
        if ($roleId) {
            $this->pdo->prepare(
                'INSERT INTO user_roles (id, user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)'
            )->execute([Helpers::cuid('ur'), $id, $roleId, $user['id'], $now]);
        }

        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['user' => Roles::publicUserFromPdo($this->pdo, $stmt->fetch())], 201);
    }

    private function linesFor(string $transactionId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM line_items WHERE transaction_id = ?');
        $stmt->execute([$transactionId]);
        return $stmt->fetchAll();
    }

    private function nullable($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) $value);
        return $text === '' ? null : $text;
    }
}
