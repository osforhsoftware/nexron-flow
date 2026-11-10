<?php

declare(strict_types=1);

/**
 * Phase 2 commercial docs — simple flow only (no approvals).
 * Sales: quotation → sale_order → delivery → sale invoice
 * Purchase: purchase_order → purchase bill
 */
final class Docs
{
    public const NEXT = [
        'quotation' => 'sale_order',
        'sale_order' => 'delivery',
        'delivery' => 'sale',
        'purchase_order' => 'purchase',
    ];

    public const PREFIX = [
        'quotation' => 'QT-',
        'sale_order' => 'SO-',
        'delivery' => 'DC-',
        'purchase_order' => 'PO-',
    ];

    private PDO $pdo;
    private array $config;

    public function __construct(PDO $pdo, array $config)
    {
        $this->pdo = $pdo;
        $this->config = $config;
    }

    public function handle(string $method, string $path): bool
    {
        if ($method === 'GET' && $path === '/api/docs') {
            $this->listDocs();
            return true;
        }
        if ($method === 'POST' && $path === '/api/docs') {
            $this->createDoc();
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)/convert$#', $path, $m) && $method === 'POST') {
            $this->convertDoc($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)$#', $path, $m) && $method === 'GET') {
            $this->getDoc($m[1]);
            return true;
        }
        return false;
    }

    private function listDocs(): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $companyId = (string) ($_GET['companyId'] ?? '');
        $docType = (string) ($_GET['type'] ?? '');
        if ($companyId === '' || $docType === '') {
            Response::error('companyId and type required', 400);
        }
        $stmt = $this->pdo->prepare(
            'SELECT * FROM docs WHERE company_id = ? AND doc_type = ? ORDER BY date DESC, created_at DESC'
        );
        $stmt->execute([$companyId, $docType]);
        $rows = $stmt->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $out[] = $this->toApi($row, $this->linesFor($row['id']));
        }
        Response::json(['docs' => $out]);
    }

    private function getDoc(string $id): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Document not found', 404);
        }
        Response::json(['doc' => $this->toApi($row, $this->linesFor($id))]);
    }

    private function createDoc(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'store', 'accounts']);
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $docType = (string) ($body['docType'] ?? '');
        $date = (string) ($body['date'] ?? '');
        $allowed = ['quotation', 'sale_order', 'delivery', 'purchase_order'];
        if ($companyId === '' || $date === '' || !in_array($docType, $allowed, true)) {
            Response::error('Invalid document data', 400);
        }
        $lines = is_array($body['lines'] ?? null) ? $body['lines'] : [];
        if (!$lines) {
            Response::error('Add at least one line', 400);
        }

        $number = trim((string) ($body['number'] ?? ''));
        if ($number === '') {
            $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM docs WHERE company_id = ? AND doc_type = ?');
            $countStmt->execute([$companyId, $docType]);
            $number = (self::PREFIX[$docType] ?? 'DOC-') . (1000 + (int) $countStmt->fetchColumn() + 1);
        }

        $subtotal = (float) ($body['subtotal'] ?? 0);
        $taxTotal = (float) ($body['taxTotal'] ?? 0);
        $grandTotal = (float) ($body['grandTotal'] ?? ($subtotal + $taxTotal));
        $id = Helpers::cuid('doc');
        $now = Helpers::now();

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'INSERT INTO docs (id, company_id, doc_type, number, date, party_id, status, notes, subtotal, tax_total, grand_total, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $id, $companyId, $docType, $number, $date,
                $this->nullable($body['partyId'] ?? null),
                'open',
                $this->nullable($body['notes'] ?? null),
                $subtotal, $taxTotal, $grandTotal, $now, $now,
            ]);
            $this->insertLines($companyId, $id, $lines);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to create document', 500, $e->getMessage());
        }

        $this->getDoc($id);
    }

    private function convertDoc(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        Auth::requireRoles($user, ['admin', 'office', 'store', 'accounts']);

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }
        if (($doc['status'] ?? '') !== 'open') {
            Response::error('Already converted', 400);
        }

        $fromType = $doc['doc_type'];
        $next = self::NEXT[$fromType] ?? null;
        if (!$next) {
            Response::error('Cannot convert this document', 400);
        }

        $lines = $this->linesFor($id);
        if (!$lines) {
            Response::error('Document has no lines', 400);
        }

        $now = Helpers::now();
        $this->pdo->beginTransaction();
        try {
            if ($next === 'sale' || $next === 'purchase') {
                $newId = $this->createInvoiceFromDoc($doc, $lines, $next, $now);
                $convertedType = $next;
            } else {
                $newId = $this->createNextDoc($doc, $lines, $next, $now);
                $convertedType = $next;
            }

            $this->pdo->prepare(
                'UPDATE docs SET status = ?, converted_to_id = ?, converted_to_type = ?, updated_at = ? WHERE id = ?'
            )->execute(['converted', $newId, $convertedType, $now, $id]);

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Convert failed', 500, $e->getMessage());
        }

        Response::json([
            'ok' => true,
            'fromId' => $id,
            'toId' => $newId,
            'toType' => $convertedType,
        ]);
    }

    private function createNextDoc(array $doc, array $lines, string $nextType, string $now): string
    {
        $companyId = $doc['company_id'];
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM docs WHERE company_id = ? AND doc_type = ?');
        $countStmt->execute([$companyId, $nextType]);
        $number = (self::PREFIX[$nextType] ?? 'DOC-') . (1000 + (int) $countStmt->fetchColumn() + 1);
        $id = Helpers::cuid('doc');

        $this->pdo->prepare(
            'INSERT INTO docs (id, company_id, doc_type, number, date, party_id, status, notes, subtotal, tax_total, grand_total, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $companyId, $nextType, $number, $doc['date'],
            $doc['party_id'], 'open', $doc['notes'],
            $doc['subtotal'], $doc['tax_total'], $doc['grand_total'], $now, $now,
        ]);

        $apiLines = array_map(static function (array $l): array {
            return [
                'itemId' => $l['item_id'] ?: null,
                'name' => $l['name'],
                'qty' => (float) $l['qty'],
                'rate' => (float) $l['rate'],
                'taxPercent' => (float) $l['tax_percent'],
                'amount' => (float) $l['amount'],
            ];
        }, $lines);
        $this->insertLines($companyId, $id, $apiLines);
        return $id;
    }

    private function createInvoiceFromDoc(array $doc, array $lines, string $txnType, string $now): string
    {
        $companyId = $doc['company_id'];
        $prefix = $txnType === 'sale' ? 'INV-' : 'PUR-';
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM transactions WHERE company_id = ? AND type = ?');
        $countStmt->execute([$companyId, $txnType]);
        $number = $prefix . (1000 + (int) $countStmt->fetchColumn() + 1);
        $id = Helpers::cuid('txn');

        $this->pdo->prepare(
            'INSERT INTO transactions (id, company_id, type, number, date, party_id, payment_type_id, notes, subtotal, tax_total, grand_total, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $companyId, $txnType, $number, $doc['date'],
            $doc['party_id'], $doc['notes'],
            $doc['subtotal'], $doc['tax_total'], $doc['grand_total'], $now, $now,
        ]);

        $lineStmt = $this->pdo->prepare(
            'INSERT INTO line_items (id, company_id, transaction_id, item_id, name, qty, rate, tax_percent, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stockStmt = $this->pdo->prepare('UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?');

        foreach ($lines as $line) {
            $lineStmt->execute([
                Helpers::cuid('li'), $companyId, $id,
                $line['item_id'] ?: null, $line['name'],
                (float) $line['qty'], (float) $line['rate'], (float) $line['tax_percent'], (float) $line['amount'],
            ]);
            if (!empty($line['item_id'])) {
                $delta = $txnType === 'sale' ? -((float) $line['qty']) : (float) $line['qty'];
                $stockStmt->execute([$delta, $now, $line['item_id']]);
            }
        }
        return $id;
    }

    private function insertLines(string $companyId, string $docId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO doc_lines (id, company_id, doc_id, item_id, name, qty, rate, tax_percent, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($lines as $line) {
            $stmt->execute([
                Helpers::cuid('dl'),
                $companyId,
                $docId,
                $this->nullable($line['itemId'] ?? null),
                trim((string) ($line['name'] ?? '')),
                (float) ($line['qty'] ?? 0),
                (float) ($line['rate'] ?? 0),
                (float) ($line['taxPercent'] ?? 0),
                (float) ($line['amount'] ?? 0),
            ]);
        }
    }

    private function linesFor(string $docId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM doc_lines WHERE doc_id = ?');
        $stmt->execute([$docId]);
        return $stmt->fetchAll();
    }

    private function toApi(array $row, array $lines = []): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'docType' => $row['doc_type'],
            'number' => $row['number'],
            'date' => $row['date'],
            'partyId' => $row['party_id'] ?: null,
            'status' => $row['status'],
            'notes' => $row['notes'] ?: null,
            'subtotal' => (float) $row['subtotal'],
            'taxTotal' => (float) $row['tax_total'],
            'grandTotal' => (float) $row['grand_total'],
            'convertedToId' => $row['converted_to_id'] ?: null,
            'convertedToType' => $row['converted_to_type'] ?: null,
            'createdAt' => $row['created_at'],
            'lines' => array_map(static function (array $l): array {
                return [
                    'id' => $l['id'],
                    'itemId' => $l['item_id'] ?: null,
                    'name' => $l['name'],
                    'qty' => (float) $l['qty'],
                    'rate' => (float) $l['rate'],
                    'taxPercent' => (float) $l['tax_percent'],
                    'amount' => (float) $l['amount'],
                ];
            }, $lines),
        ];
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
