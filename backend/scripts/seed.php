<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/Response.php';
require_once dirname(__DIR__) . '/src/Database.php';
require_once dirname(__DIR__) . '/src/Schema.php';
require_once dirname(__DIR__) . '/src/Helpers.php';

$config = require dirname(__DIR__) . '/config/config.php';
$pdo = Database::pdo($config);
Schema::migrate($pdo);

function daysAgo(int $n): string
{
    return gmdate('Y-m-d', time() - ($n * 86400));
}

$pdo->exec('DELETE FROM line_items');
$pdo->exec('DELETE FROM transactions');
$pdo->exec('DELETE FROM payment_types');
$pdo->exec('DELETE FROM items');
$pdo->exec('DELETE FROM parties');
$pdo->exec('DELETE FROM master_data');
$pdo->exec('DELETE FROM companies');
$pdo->exec('DELETE FROM users');

$now = Helpers::now();
$password = password_hash('demo@123', PASSWORD_BCRYPT);

$users = [
    ['admin', 'Demo Admin', 'admin'],
    ['office1', 'Office User', 'office'],
    ['field1', 'Field User', 'field'],
    ['store1', 'Store User', 'store'],
    ['accounts1', 'Accounts User', 'accounts'],
];

$userStmt = $pdo->prepare(
    'INSERT INTO users (id, username, password_hash, name, phone, email, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
);
foreach ($users as [$username, $name, $role]) {
    $userStmt->execute([
        Helpers::cuid('usr'),
        $username,
        $password,
        $name,
        '9846154357',
        $username . '@ledgerly.demo',
        $role,
        $now,
        $now,
    ]);
}

$coA = Helpers::cuid('co');
$coB = Helpers::cuid('co');
$pdo->prepare(
    'INSERT INTO companies (id, name, phone, email, gstin, address, state, country, currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([
    $coA, 'Nexron UAE Services', '971500000001', 'accounts@nexron-uae.demo',
    '100123456700003', 'Business Bay, Dubai', 'Dubai', 'AE', 'AED', $now, $now,
]);
$pdo->prepare(
    'INSERT INTO companies (id, name, phone, email, gstin, address, state, country, currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([
    $coB, 'Coastal Supplies Co.', '9876543210', 'hello@coastal.demo',
    '32AABCC9876F1Z2', '8 Harbour Lane, Kochi', 'Kerala', 'IN', 'INR', $now, $now,
]);

$parties = [
    [$coA, 'Aarav Electronics', '9001002001', 'customer', 12000, 'to_receive', 'MG Road'],
    [$coA, 'Nova Wholesale', '9001002002', 'supplier', 8500, 'to_pay', 'Peenya'],
    [$coA, 'City Mart Retail', '9001002003', 'both', 0, 'to_receive', null],
    [$coB, 'Harbour Cafe', '9111222333', 'customer', 2400, 'to_receive', null],
];
$partyIds = [];
$partyStmt = $pdo->prepare(
    'INSERT INTO parties (id, company_id, name, phone, email, gstin, type, opening_balance, balance_type, address, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)'
);
foreach ($parties as $p) {
    $id = Helpers::cuid('pty');
    $partyIds[] = $id;
    $partyStmt->execute([$id, $p[0], $p[1], $p[2], $p[3], $p[4], $p[5], $p[6], $now, $now]);
}

$items = [
    [$coA, 'LED Bulb 9W', 'LED-9W', 'pcs', 120, 75, 240, 18, 'Electrical'],
    [$coA, 'Copper Wire 1.5mm', 'CW-15', 'mtr', 45, 28, 1000, 18, 'Electrical'],
    [$coA, 'Switch Board 8M', 'SB-8M', 'pcs', 380, 240, 65, 18, 'Hardware'],
    [$coB, 'Paper Cups 200ml', 'PC-200', 'pkt', 90, 55, 180, 5, 'Packaging'],
];
$itemIds = [];
$itemStmt = $pdo->prepare(
    'INSERT INTO items (id, company_id, name, sku, unit, sale_price, purchase_price, stock_qty, tax_percent, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
foreach ($items as $it) {
    $id = Helpers::cuid('itm');
    $itemIds[] = $id;
    $itemStmt->execute([$id, $it[0], $it[1], $it[2], $it[3], $it[4], $it[5], $it[6], $it[7], $it[8], $now, $now]);
}

$cashId = Helpers::cuid('pay');
$bankId = Helpers::cuid('pay');
$payStmt = $pdo->prepare(
    'INSERT INTO payment_types (id, company_id, name, kind, opening_balance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$payStmt->execute([$cashId, $coA, 'Cash', 'cash', 15000, $now, $now]);
$payStmt->execute([$bankId, $coA, 'HDFC Current', 'bank', 125000, $now, $now]);
$payStmt->execute([Helpers::cuid('pay'), $coA, 'UPI', 'upi', 0, $now, $now]);
$payStmt->execute([Helpers::cuid('pay'), $coB, 'Cash', 'cash', 8000, $now, $now]);
$payStmt->execute([Helpers::cuid('pay'), $coB, 'SBI Savings', 'bank', 42000, $now, $now]);

$masterKinds = [
    ['tax', 'gst18', 'GST 18%', '18'],
    ['tax', 'gst5', 'GST 5%', '5'],
    ['unit', 'pcs', 'Pieces', 'pcs'],
    ['unit', 'mtr', 'Meter', 'mtr'],
    ['series', 'sale', 'Sale Invoice Series', 'INV-'],
    ['series', 'purchase', 'Purchase Bill Series', 'PUR-'],
    ['payment_mode', 'cash', 'Cash', 'cash'],
    ['payment_mode', 'upi', 'UPI', 'upi'],
];
$mdStmt = $pdo->prepare(
    'INSERT INTO master_data (id, company_id, kind, code, label, value, sort_order, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
);
$i = 0;
foreach ($masterKinds as $md) {
    $mdStmt->execute([Helpers::cuid('md'), $coA, $md[0], $md[1], $md[2], $md[3], $i++, $now]);
}

$saleId = Helpers::cuid('txn');
$purchaseId = Helpers::cuid('txn');
$payInId = Helpers::cuid('txn');

$saleSub = 20 * 120 + 4 * 380;
$saleTax = 20 * 120 * 0.18 + 4 * 380 * 0.18;
$purchSub = 200 * 28;
$purchTax = 200 * 28 * 0.18;

$txnStmt = $pdo->prepare(
    'INSERT INTO transactions (id, company_id, type, number, date, party_id, payment_type_id, notes, subtotal, tax_total, grand_total, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$txnStmt->execute([
    $saleId, $coA, 'sale', 'INV-1001', daysAgo(3), $partyIds[0], $cashId, 'Counter sale',
    $saleSub, $saleTax, $saleSub + $saleTax, $now, $now,
]);
$txnStmt->execute([
    $purchaseId, $coA, 'purchase', 'PUR-501', daysAgo(5), $partyIds[1], $bankId, 'Wire stock refill',
    $purchSub, $purchTax, $purchSub + $purchTax, $now, $now,
]);
$txnStmt->execute([
    $payInId, $coA, 'payment_in', 'RCPT-201', daysAgo(1), $partyIds[0], $bankId, 'Partial collection',
    5000, 0, 5000, $now, $now,
]);

$lineStmt = $pdo->prepare(
    'INSERT INTO line_items (id, company_id, transaction_id, item_id, name, qty, rate, tax_percent, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$lineStmt->execute([Helpers::cuid('li'), $coA, $saleId, $itemIds[0], 'LED Bulb 9W', 20, 120, 18, 20 * 120 * 1.18]);
$lineStmt->execute([Helpers::cuid('li'), $coA, $saleId, $itemIds[2], 'Switch Board 8M', 4, 380, 18, 4 * 380 * 1.18]);
$lineStmt->execute([Helpers::cuid('li'), $coA, $purchaseId, $itemIds[1], 'Copper Wire 1.5mm', 200, 28, 18, 200 * 28 * 1.18]);

$pdo->prepare('UPDATE items SET stock_qty = stock_qty - 20 WHERE id = ?')->execute([$itemIds[0]]);
$pdo->prepare('UPDATE items SET stock_qty = stock_qty - 4 WHERE id = ?')->execute([$itemIds[2]]);
$pdo->prepare('UPDATE items SET stock_qty = stock_qty + 200 WHERE id = ?')->execute([$itemIds[1]]);

$dbName = $config['db']['name'] ?? 'ledgerly';
$dbHost = $config['db']['host'] ?? '127.0.0.1';
echo "Seed complete.\n";
echo "Demo password for all users: demo@123\n";
echo "Users: admin, office1, field1, store1, accounts1\n";
echo "MySQL: {$dbHost} / {$dbName}\n";
echo "Start API: cd backend && C:\\xampp\\php\\php.exe -S 127.0.0.1:4000 server.php\n";
