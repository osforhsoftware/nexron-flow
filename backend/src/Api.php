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

        if ($method === 'GET' && $path === '/api/items') {
            $this->listItems();
        }
        if ($method === 'POST' && $path === '/api/items') {
            $this->createItem();
        }
        if (preg_match('#^/api/items/([^/]+)$#', $path, $m)) {
            if ($method === 'PATCH') {
                $this->updateItem($m[1]);
            }
            if ($method === 'DELETE') {
                $this->deleteItem($m[1]);
            }
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
            ['sub' => $user['id'], 'username' => $user['username'], 'role' => $user['role']],
            $this->config['jwt_secret'],
            (int) $this->config['jwt_ttl_seconds']
        );
        Response::json(['token' => $token, 'user' => Roles::publicUser($user)]);
    }

    private function me(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Response::json(['user' => Roles::publicUser($user)]);
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
        Auth::requireRoles($user, ['admin', 'office']);
        $body = Helpers::body();
        $name = trim((string) ($body['name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? ''));
        if ($name === '' || $phone === '') {
            Response::error('Invalid company data', 400);
        }
        $id = Helpers::cuid('co');
        $now = Helpers::now();
        $stmt = $this->pdo->prepare(
            'INSERT INTO companies (id, name, phone, email, gstin, address, state, currency, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id, $name, $phone,
            $this->nullable($body['email'] ?? null),
            $this->nullable($body['gstin'] ?? null),
            $this->nullable($body['address'] ?? null),
            $this->nullable($body['state'] ?? null),
            trim((string) ($body['currency'] ?? 'INR')) ?: 'INR',
            $now, $now,
        ]);
        $this->getCompany($id);
    }

    private function updateCompany(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'accounts']);
        $body = Helpers::body();
        $fields = [];
        $params = [];
        foreach (['name', 'phone', 'email', 'gstin', 'address', 'state', 'currency'] as $key) {
            if (array_key_exists($key, $body)) {
                $fields[] = $key . ' = ?';
                $params[] = in_array($key, ['email', 'gstin', 'address', 'state'], true)
                    ? $this->nullable($body[$key])
                    : trim((string) $body[$key]);
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
        Auth::requireUser($this->pdo, $this->config);
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
        Auth::requireRoles($user, ['admin', 'office', 'store', 'accounts']);
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        $type = (string) ($body['type'] ?? '');
        if ($companyId === '' || $name === '' || !in_array($type, ['customer', 'supplier', 'both'], true)) {
            Response::error('Invalid party data', 400);
        }
        $id = Helpers::cuid('pty');
        $now = Helpers::now();
        $stmt = $this->pdo->prepare(
            'INSERT INTO parties (id, company_id, name, phone, email, gstin, type, opening_balance, balance_type, address, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $id, $companyId, $name,
            $this->nullable($body['phone'] ?? null),
            $this->nullable($body['email'] ?? null),
            $this->nullable($body['gstin'] ?? null),
            $type,
            (float) ($body['openingBalance'] ?? 0),
            (string) ($body['balanceType'] ?? 'to_receive'),
            $this->nullable($body['address'] ?? null),
            $now, $now,
        ]);
        $stmt = $this->pdo->prepare('SELECT * FROM parties WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['party' => Helpers::partyToApi($stmt->fetch())], 201);
    }

    private function updateParty(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'store', 'accounts']);
        $body = Helpers::body();
        $map = [
            'name' => 'name',
            'phone' => 'phone',
            'email' => 'email',
            'gstin' => 'gstin',
            'type' => 'type',
            'openingBalance' => 'opening_balance',
            'balanceType' => 'balance_type',
            'address' => 'address',
        ];
        $fields = [];
        $params = [];
        foreach ($map as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $fields[] = $col . ' = ?';
            if (in_array($api, ['phone', 'email', 'gstin', 'address'], true)) {
                $params[] = $this->nullable($body[$api]);
            } elseif ($api === 'openingBalance') {
                $params[] = (float) $body[$api];
            } else {
                $params[] = is_string($body[$api]) ? trim($body[$api]) : $body[$api];
            }
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
        Auth::requireRoles($user, ['admin', 'office']);
        $stmt = $this->pdo->prepare('DELETE FROM parties WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function listItems(): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $stmt = $this->pdo->prepare('SELECT * FROM items WHERE company_id = ? ORDER BY name ASC');
        $stmt->execute([$companyId]);
        Response::json(['items' => array_map([Helpers::class, 'itemToApi'], $stmt->fetchAll())]);
    }

    private function createItem(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'store']);
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));
        if ($companyId === '' || $name === '') {
            Response::error('Invalid item data', 400);
        }
        $id = Helpers::cuid('itm');
        $now = Helpers::now();
        $this->pdo->prepare(
            'INSERT INTO items (id, company_id, name, sku, unit, sale_price, purchase_price, stock_qty, tax_percent, category, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $companyId, $name,
            $this->nullable($body['sku'] ?? null),
            trim((string) ($body['unit'] ?? 'pcs')) ?: 'pcs',
            (float) ($body['salePrice'] ?? 0),
            (float) ($body['purchasePrice'] ?? 0),
            (float) ($body['stockQty'] ?? 0),
            (float) ($body['taxPercent'] ?? 18),
            $this->nullable($body['category'] ?? null),
            $now, $now,
        ]);
        $stmt = $this->pdo->prepare('SELECT * FROM items WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['item' => Helpers::itemToApi($stmt->fetch())], 201);
    }

    private function updateItem(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'store']);
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
        ];
        $fields = [];
        $params = [];
        foreach ($map as $api => $col) {
            if (!array_key_exists($api, $body)) {
                continue;
            }
            $fields[] = $col . ' = ?';
            if (in_array($api, ['sku', 'category'], true)) {
                $params[] = $this->nullable($body[$api]);
            } elseif (in_array($api, ['salePrice', 'purchasePrice', 'stockQty', 'taxPercent'], true)) {
                $params[] = (float) $body[$api];
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
        Auth::requireRoles($user, ['admin', 'office', 'store']);
        $this->pdo->prepare('DELETE FROM items WHERE id = ?')->execute([$id]);
        Response::json(['ok' => true]);
    }

    private function listAccounts(): void
    {
        Auth::requireUser($this->pdo, $this->config);
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
        Auth::requireRoles($user, ['admin', 'office', 'accounts', 'store']);
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
        Auth::requireUser($this->pdo, $this->config);
        $companyId = (string) ($_GET['companyId'] ?? '');
        if ($companyId === '') {
            Response::error('companyId required', 400);
        }
        $type = isset($_GET['type']) ? (string) $_GET['type'] : '';
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
        $out = [];
        foreach ($rows as $row) {
            $out[] = Helpers::txnToApi($row, $this->linesFor($row['id']));
        }
        Response::json(['transactions' => $out]);
    }

    private function getTransaction(string $id): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT * FROM transactions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Transaction not found', 404);
        }
        Response::json(['transaction' => Helpers::txnToApi($row, $this->linesFor($id))]);
    }

    private function deleteTransaction(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'accounts']);
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
            if ($type === 'sale' || $type === 'purchase') {
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
        Auth::requireRoles($user, ['admin', 'office', 'store', 'accounts']);
        $body = Helpers::body();
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
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to create transaction', 500, $e->getMessage());
        }

        $this->getTransaction($id);
    }

    private function listMaster(): void
    {
        Auth::requireUser($this->pdo, $this->config);
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
        Auth::requireRoles($user, ['admin', 'office']);
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
        Auth::requireRoles($user, ['admin']);
        $rows = $this->pdo->query('SELECT * FROM users ORDER BY name ASC')->fetchAll();
        Response::json(['users' => array_map([Roles::class, 'publicUser'], $rows)]);
    }

    private function createUser(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin']);
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
        $this->pdo->prepare(
            'INSERT INTO users (id, username, password_hash, name, phone, email, role, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
        )->execute([
            $id, $username, password_hash($password, PASSWORD_BCRYPT), $name,
            $this->nullable($body['phone'] ?? null),
            $this->nullable($body['email'] ?? null),
            $role, $now, $now,
        ]);
        $stmt = $this->pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['user' => Roles::publicUser($stmt->fetch())], 201);
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
