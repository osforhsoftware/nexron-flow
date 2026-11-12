<?php

declare(strict_types=1);

/**
 * Phase 2 commercial docs — quotations with full lifecycle + pipeline convert.
 * Sales: quotation → sale_order → delivery → sale invoice
 * Purchase: RFQ → PO → GRN → purchase bill, plus standalone returns.
 */
final class Docs
{
    public const NEXT = [
        'quotation' => 'sale_order',
        'sale_order' => 'delivery',
        'delivery' => 'sale',
        'rfq' => 'purchase_order',
        'purchase_order' => 'grn',
        'grn' => 'purchase',
    ];

    public const PREFIX = [
        'quotation' => 'QT-',
        'sale_order' => 'SO-',
        'delivery' => 'DC-',
        'rfq' => 'RFQ-',
        'purchase_order' => 'PO-',
        'grn' => 'GRN-',
        'purchase_return' => 'PRN-',
    ];

    public const ALLOWED = [
        'quotation',
        'sale_order',
        'delivery',
        'rfq',
        'purchase_order',
        'grn',
        'purchase_return',
    ];

    /** Quotation lifecycle statuses (other doc types still use draft/converted). */
    public const QUOTE_STATUSES = [
        'draft',
        'sent',
        'viewed',
        'accepted',
        'declined',
        'expired',
        'converted',
    ];

    public const LOCKED_STATUSES = ['accepted', 'converted'];

    private PDO $pdo;
    private array $config;

    public function __construct(PDO $pdo, array $config)
    {
        $this->pdo = $pdo;
        $this->config = $config;
    }

    
    private function requireDocPermission(array $user, string $docType, string $action): void
    {
        Auth::requirePermission($this->pdo, $user, Rbac::directoryForDocType($docType), $action);
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
        if (preg_match('#^/api/docs/([^/]+)/revoke$#', $path, $m) && $method === 'POST') {
            $this->revokeConversion($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)/post-stock$#', $path, $m) && $method === 'POST') {
            $this->postStock($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)/clone$#', $path, $m) && $method === 'POST') {
            $this->cloneDoc($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)/status$#', $path, $m) && $method === 'POST') {
            $this->updateStatus($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)/revisions$#', $path, $m) && $method === 'GET') {
            $this->listRevisions($m[1]);
            return true;
        }
        if (preg_match('#^/api/docs/([^/]+)$#', $path, $m)) {
            if ($method === 'GET') {
                $this->getDoc($m[1]);
                return true;
            }
            if ($method === 'PUT' || $method === 'PATCH') {
                $this->updateDoc($m[1]);
                return true;
            }
            if ($method === 'DELETE') {
                $this->deleteDoc($m[1]);
                return true;
            }
        }
        return false;
    }

    private function listDocs(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $companyId = (string) ($_GET['companyId'] ?? '');
        $docType = (string) ($_GET['type'] ?? '');
        if ($companyId === '' || $docType === '') {
            Response::error('companyId and type required', 400);
        }
        $this->requireDocPermission($user, $docType, 'read');
        $this->expireOverdue($companyId, $docType);
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
        $user = Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Document not found', 404);
        }
        $this->requireDocPermission($user, (string) $row['doc_type'], 'read');
        if (($row['doc_type'] ?? '') === 'quotation') {
            $this->expireOverdue((string) $row['company_id'], 'quotation', $id);
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                Response::error('Document not found', 404);
            }
        }
        Response::json(['doc' => $this->toApi($row, $this->linesFor($id))]);
    }

    private function createDoc(): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $body = Helpers::body();
        $companyId = (string) ($body['companyId'] ?? '');
        $docType = (string) ($body['docType'] ?? '');
        $date = (string) ($body['date'] ?? '');
        $allowed = self::ALLOWED;
        if ($companyId === '' || $date === '' || !in_array($docType, $allowed, true)) {
            Response::error('Invalid document data', 400);
        }
        $this->requireDocPermission($user, $docType, 'create');
        $lines = is_array($body['lines'] ?? null) ? $body['lines'] : [];
        if (!$lines) {
            Response::error('Add at least one line', 400);
        }
        $normalized = $this->normalizeDocMoney($docType, $lines);
        $lines = $normalized['lines'];
        $body['subtotal'] = $normalized['subtotal'];
        $body['taxTotal'] = $normalized['taxTotal'];
        $body['grandTotal'] = $normalized['grandTotal'];

        $status = $this->normalizeCreateStatus($docType, (string) ($body['status'] ?? 'draft'));
        $number = $this->nextNumber($companyId, $docType, trim((string) ($body['number'] ?? '')));
        $id = Helpers::cuid('doc');
        $now = Helpers::now();

        $this->pdo->beginTransaction();
        try {
            $this->insertDocRow($id, $companyId, $docType, $number, $date, $status, $body, $now, null);
            $this->insertLines($companyId, $id, $lines);
            // Direct GRN / return: stock moves on save (PO→GRN convert stays draft until received qty is confirmed).
            if (in_array($docType, ['grn', 'purchase_return'], true)) {
                $this->applyStockEffects($id, $now);
            }
            $this->saveRevision($companyId, $id, 1, $user['id'] ?? null, 'Created');
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to create document', 500, $e->getMessage());
        }

        $this->getDoc($id);
    }

    private function updateDoc(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'update');
        $body = Helpers::body();

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }

        $status = $this->normalizeLegacyStatus((string) ($doc['status'] ?? 'draft'));
        if (in_array($status, self::LOCKED_STATUSES, true)) {
            Response::error('Cannot edit an Accepted or Converted quotation', 400);
        }
        if (!empty($doc['stock_posted_at'])) {
            Response::error('Cannot edit after stock has been updated', 400);
        }

        $lines = is_array($body['lines'] ?? null) ? $body['lines'] : null;
        if ($lines !== null && !$lines) {
            Response::error('Add at least one line', 400);
        }
        $docType = (string) ($doc['doc_type'] ?? '');
        if ($lines !== null) {
            $normalized = $this->normalizeDocMoney($docType, $lines);
            $lines = $normalized['lines'];
            $body['subtotal'] = $normalized['subtotal'];
            $body['taxTotal'] = $normalized['taxTotal'];
            $body['grandTotal'] = $normalized['grandTotal'];
        }

        $now = Helpers::now();
        $revision = (int) ($doc['revision'] ?? 1) + 1;

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'UPDATE docs SET
                    number = ?, date = ?, party_id = ?, notes = ?, terms = ?,
                    valid_until = ?, follow_up_date = ?, billing_address = ?, state_of_supply = ?,
                    price_tax_mode = ?, round_off = ?, discount_total = ?,
                    subtotal = ?, tax_total = ?, grand_total = ?, ref_no = ?, original_bill_no = ?,
                    revision = ?, updated_at = ?
                 WHERE id = ?'
            )->execute([
                trim((string) ($body['number'] ?? $doc['number'])),
                (string) ($body['date'] ?? $doc['date']),
                $this->nullable($body['partyId'] ?? $doc['party_id']),
                $this->nullable($body['notes'] ?? $doc['notes']),
                $this->nullable($body['terms'] ?? ($doc['terms'] ?? null)),
                $this->nullable($body['validUntil'] ?? ($doc['valid_until'] ?? null)),
                $this->nullable($body['followUpDate'] ?? ($doc['follow_up_date'] ?? null)),
                $this->nullable($body['billingAddress'] ?? ($doc['billing_address'] ?? null)),
                $this->nullable($body['stateOfSupply'] ?? ($doc['state_of_supply'] ?? null)),
                (string) ($body['priceTaxMode'] ?? ($doc['price_tax_mode'] ?? 'without')),
                !empty($body['roundOff'] ?? ($doc['round_off'] ?? 1)) ? 1 : 0,
                (float) ($body['discountTotal'] ?? ($doc['discount_total'] ?? 0)),
                (float) ($body['subtotal'] ?? $doc['subtotal']),
                (float) ($body['taxTotal'] ?? $doc['tax_total']),
                (float) ($body['grandTotal'] ?? $doc['grand_total']),
                $this->nullable($body['refNo'] ?? ($doc['ref_no'] ?? null)),
                $this->nullable($body['originalBillNo'] ?? ($doc['original_bill_no'] ?? null)),
                $revision,
                $now,
                $id,
            ]);

            if ($lines !== null) {
                $this->pdo->prepare('DELETE FROM doc_lines WHERE doc_id = ?')->execute([$id]);
                $this->insertLines((string) $doc['company_id'], $id, $lines);
            }

            if (
                in_array($docType, ['grn', 'purchase_return'], true)
                && empty($doc['stock_posted_at'])
                && empty($body['skipStock'])
            ) {
                $this->applyStockEffects($id, $now);
            }

            $note = trim((string) ($body['changeNote'] ?? 'Updated'));
            $this->saveRevision((string) $doc['company_id'], $id, $revision, $user['id'] ?? null, $note ?: 'Updated');
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to update document', 500, $e->getMessage());
        }

        $this->getDoc($id);
    }

    private function deleteDoc(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'delete');

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }
        $status = $this->normalizeLegacyStatus((string) ($doc['status'] ?? 'draft'));
        if ($status === 'converted') {
            Response::error('Cannot delete a converted document', 400);
        }
        if (!empty($doc['stock_posted_at'])) {
            Response::error('Cannot delete after stock has been updated', 400);
        }

        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('DELETE FROM doc_revisions WHERE doc_id = ?')->execute([$id]);
            $this->pdo->prepare('DELETE FROM doc_lines WHERE doc_id = ?')->execute([$id]);
            $this->pdo->prepare('DELETE FROM docs WHERE id = ?')->execute([$id]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to delete document', 500, $e->getMessage());
        }

        Response::json(['ok' => true]);
    }

    private function cloneDoc(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'create');

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }

        $lines = $this->linesFor($id);
        if (!$lines) {
            Response::error('Document has no lines', 400);
        }

        $companyId = (string) $doc['company_id'];
        $docType = (string) $doc['doc_type'];
        $newId = Helpers::cuid('doc');
        $now = Helpers::now();
        $number = $this->nextNumber($companyId, $docType, '');
        $body = [
            'partyId' => $doc['party_id'],
            'notes' => $doc['notes'],
            'terms' => $doc['terms'] ?? null,
            'validUntil' => $doc['valid_until'] ?? null,
            'followUpDate' => $doc['follow_up_date'] ?? null,
            'billingAddress' => $doc['billing_address'] ?? null,
            'stateOfSupply' => $doc['state_of_supply'] ?? null,
            'priceTaxMode' => $doc['price_tax_mode'] ?? 'without',
            'roundOff' => (int) ($doc['round_off'] ?? 1),
            'discountTotal' => (float) ($doc['discount_total'] ?? 0),
            'subtotal' => (float) $doc['subtotal'],
            'taxTotal' => (float) $doc['tax_total'],
            'grandTotal' => (float) $doc['grand_total'],
            'refNo' => $doc['ref_no'] ?? null,
            'clonedFromId' => $id,
        ];

        $apiLines = array_map(static function (array $l): array {
            return [
                'itemId' => $l['item_id'] ?: null,
                'name' => $l['name'],
                'qty' => (float) $l['qty'],
                'rate' => (float) $l['rate'],
                'taxPercent' => (float) $l['tax_percent'],
                'discountPercent' => (float) ($l['discount_percent'] ?? 0),
                'unit' => $l['unit'] ?? null,
                'amount' => (float) $l['amount'],
            ];
        }, $lines);

        $this->pdo->beginTransaction();
        try {
            $this->insertDocRow($newId, $companyId, $docType, $number, date('Y-m-d'), 'draft', $body, $now, $id);
            $this->insertLines($companyId, $newId, $apiLines);
            $this->saveRevision($companyId, $newId, 1, $user['id'] ?? null, 'Cloned from ' . $doc['number']);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to clone document', 500, $e->getMessage());
        }

        $this->getDoc($newId);
    }

    private function updateStatus(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'update');
        $body = Helpers::body();
        $next = strtolower(trim((string) ($body['status'] ?? '')));

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }

        $current = $this->normalizeLegacyStatus((string) ($doc['status'] ?? 'draft'));
        if ($current === 'converted') {
            Response::error('Converted documents cannot change status', 400);
        }
        if (!in_array($next, self::QUOTE_STATUSES, true) || $next === 'converted') {
            Response::error('Invalid status', 400);
        }
        if ($current === 'accepted' && $next !== 'accepted') {
            Response::error('Accepted quotations are locked (convert or leave as Accepted)', 400);
        }

        $now = Helpers::now();
        $revision = (int) ($doc['revision'] ?? 1) + 1;
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare(
                'UPDATE docs SET status = ?, revision = ?, updated_at = ? WHERE id = ?'
            )->execute([$next, $revision, $now, $id]);
            $this->saveRevision(
                (string) $doc['company_id'],
                $id,
                $revision,
                $user['id'] ?? null,
                'Status → ' . $next
            );
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Failed to update status', 500, $e->getMessage());
        }

        $this->getDoc($id);
    }

    private function listRevisions(string $id): void
    {
        Auth::requireUser($this->pdo, $this->config);
        $stmt = $this->pdo->prepare('SELECT id FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            Response::error('Document not found', 404);
        }

        $rev = $this->pdo->prepare(
            'SELECT * FROM doc_revisions WHERE doc_id = ? ORDER BY revision DESC, created_at DESC'
        );
        $rev->execute([$id]);
        $rows = $rev->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $snapshot = json_decode((string) $row['snapshot'], true);
            $out[] = [
                'id' => $row['id'],
                'docId' => $row['doc_id'],
                'revision' => (int) $row['revision'],
                'changedBy' => $row['changed_by'] ?: null,
                'changeNote' => $row['change_note'] ?: null,
                'createdAt' => $row['created_at'],
                'snapshot' => is_array($snapshot) ? $snapshot : null,
            ];
        }
        Response::json(['revisions' => $out]);
    }

    private function convertDoc(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'update');
        $body = Helpers::body();

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }

        $status = $this->normalizeLegacyStatus((string) ($doc['status'] ?? 'draft'));
        if ($status === 'converted') {
            Response::error('Already converted', 400);
        }
        if (in_array($status, ['declined', 'expired'], true)) {
            Response::error('Cannot convert a declined or expired quotation', 400);
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
        $overrideLines = is_array($body['lines'] ?? null) ? $body['lines'] : null;
        if ($overrideLines !== null) {
            // next doc type drives billable qty (e.g. GRN uses receivedQty).
            $nextType = self::NEXT[$fromType] ?? $fromType;
            $normalized = $this->normalizeDocMoney($nextType, $overrideLines);
            $overrideLines = $normalized['lines'];
            $doc['subtotal'] = $normalized['subtotal'];
            $doc['tax_total'] = $normalized['taxTotal'];
            $doc['grand_total'] = $normalized['grandTotal'];
        }

        $now = Helpers::now();
        $revision = (int) ($doc['revision'] ?? 1) + 1;
        $this->pdo->beginTransaction();
        try {
            // GRN → bill: receive stock from received qty first if not yet posted.
            if ($fromType === 'grn' && $next === 'purchase' && empty($doc['stock_posted_at'])) {
                $this->applyStockEffects($id, $now);
                $stmt->execute([$id]);
                $doc = $stmt->fetch() ?: $doc;
                $lines = $this->linesFor($id);
            }
            if ($next === 'sale' || $next === 'purchase') {
                $newId = $this->createInvoiceFromDoc($doc, $lines, $next, $now, $body);
                $convertedType = $next;
            } else {
                $newId = $this->createNextDoc($doc, $lines, $next, $now, $overrideLines);
                $convertedType = $next;
            }

            $this->pdo->prepare(
                'UPDATE docs SET status = ?, converted_to_id = ?, converted_to_type = ?, revision = ?, updated_at = ? WHERE id = ?'
            )->execute(['converted', $newId, $convertedType, $revision, $now, $id]);
            $this->saveRevision(
                (string) $doc['company_id'],
                $id,
                $revision,
                $user['id'] ?? null,
                'Converted to ' . $convertedType
            );

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

    /**
     * Undo convert: delete unused downstream docs and reopen the source
     * (quotation → sale order, sale order → delivery, RFQ → PO, etc.).
     * Blocked once a sale/purchase invoice exists or stock was posted.
     */
    private function revokeConversion(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'update');

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }

        $parentStmt = $this->pdo->prepare('SELECT * FROM docs WHERE converted_to_id = ?');
        $parentStmt->execute([$id]);
        $parent = $parentStmt->fetch();

        $status = $this->normalizeLegacyStatus((string) ($doc['status'] ?? 'draft'));
        if ($parent) {
            $source = $parent;
        } elseif ($status === 'converted' && !empty($doc['converted_to_id'])) {
            $source = $doc;
        } else {
            Response::error('This document is not part of a conversion that can be revoked', 400);
        }

        $chain = $this->downstreamChain((string) ($source['converted_to_id'] ?? ''));
        foreach ($chain as $node) {
            if ($node['kind'] === 'invoice') {
                Response::error(
                    'Cannot revoke: a sale/purchase invoice was already created. Delete or reverse that invoice first.',
                    400
                );
            }
            if (!empty($node['row']['stock_posted_at'] ?? null)) {
                Response::error('Cannot revoke: stock has already been updated on a downstream document', 400);
            }
        }

        $restoreStatus = 'draft';
        $now = Helpers::now();
        $revision = (int) ($source['revision'] ?? 1) + 1;

        $this->pdo->beginTransaction();
        try {
            for ($i = count($chain) - 1; $i >= 0; $i--) {
                $node = $chain[$i];
                if ($node['kind'] !== 'doc' || empty($node['row']['id'])) {
                    continue;
                }
                $childId = (string) $node['row']['id'];
                $this->pdo->prepare('DELETE FROM doc_revisions WHERE doc_id = ?')->execute([$childId]);
                $this->pdo->prepare('DELETE FROM doc_lines WHERE doc_id = ?')->execute([$childId]);
                $this->pdo->prepare('DELETE FROM docs WHERE id = ?')->execute([$childId]);
            }

            $this->pdo->prepare(
                'UPDATE docs SET status = ?, converted_to_id = NULL, converted_to_type = NULL, revision = ?, updated_at = ? WHERE id = ?'
            )->execute([$restoreStatus, $revision, $now, $source['id']]);
            $this->saveRevision(
                (string) $source['company_id'],
                (string) $source['id'],
                $revision,
                $user['id'] ?? null,
                'Revoked conversion'
            );
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Revoke failed', 500, $e->getMessage());
        }

        $stmt->execute([$source['id']]);
        $fresh = $stmt->fetch();
        Response::json([
            'ok' => true,
            'doc' => $this->toApi($fresh, $this->linesFor((string) $source['id'])),
        ]);
    }

    /** @return list<array{kind: string, row?: array}> */
    private function downstreamChain(?string $startId): array
    {
        $out = [];
        $currentId = $startId;
        $guard = 0;
        while ($currentId && $guard < 12) {
            $guard++;
            $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
            $stmt->execute([$currentId]);
            $row = $stmt->fetch();
            if ($row) {
                $out[] = ['kind' => 'doc', 'row' => $row];
                $status = $this->normalizeLegacyStatus((string) ($row['status'] ?? 'draft'));
                $nextType = (string) ($row['converted_to_type'] ?? '');
                $nextId = (string) ($row['converted_to_id'] ?? '');
                if ($status !== 'converted' || $nextId === '') {
                    break;
                }
                if ($nextType === 'sale' || $nextType === 'purchase') {
                    $out[] = ['kind' => 'invoice', 'row' => ['id' => $nextId, 'type' => $nextType]];
                    break;
                }
                $currentId = $nextId;
                continue;
            }

            $txn = $this->pdo->prepare('SELECT id, type FROM transactions WHERE id = ?');
            $txn->execute([$currentId]);
            $txnRow = $txn->fetch();
            if ($txnRow) {
                $out[] = ['kind' => 'invoice', 'row' => $txnRow];
            }
            break;
        }
        return $out;
    }

    private function postStock(string $id): void
    {
        $user = Auth::requireUser($this->pdo, $this->config);
        $row = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $row->execute([$id]);
        $doc = $row->fetch();
        if (!$doc) { Response::error('Document not found', 404); }
        $this->requireDocPermission($user, (string) $doc['doc_type'], 'update');

        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            Response::error('Document not found', 404);
        }
        if (!in_array($doc['doc_type'], ['grn', 'purchase_return'], true)) {
            Response::error('Only GRN and purchase returns update stock', 400);
        }
        if (!empty($doc['stock_posted_at'])) {
            Response::error('Stock has already been updated', 400);
        }

        $now = Helpers::now();
        $this->pdo->beginTransaction();
        try {
            $this->applyStockEffects($id, $now);
            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            Response::error('Stock update failed', 500, $e->getMessage());
        }

        $this->getDoc($id);
    }

    /** Apply GRN (+qty) or purchase_return (−qty). Caller manages transaction. */
    private function applyStockEffects(string $id, string $now): void
    {
        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$id]);
        $doc = $stmt->fetch();
        if (!$doc) {
            throw new RuntimeException('Document not found for stock update');
        }
        if (!in_array($doc['doc_type'], ['grn', 'purchase_return'], true)) {
            throw new RuntimeException('Only GRN and purchase returns update stock');
        }
        if (!empty($doc['stock_posted_at'])) {
            return;
        }

        $lines = $this->linesFor($id);
        $direction = $doc['doc_type'] === 'purchase_return' ? -1 : 1;
        $stockStmt = $this->pdo->prepare(
            'UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND company_id = ?'
        );
        foreach ($lines as $line) {
            if (empty($line['item_id'])) {
                continue;
            }
            $qty = $doc['doc_type'] === 'grn' && ($line['received_qty'] ?? null) !== null
                ? (float) $line['received_qty']
                : (float) $line['qty'];
            if ($qty <= 0) {
                continue;
            }
            $stockStmt->execute([
                $direction * $qty,
                $now,
                $line['item_id'],
                $doc['company_id'],
            ]);
        }
        $status = $doc['doc_type'] === 'purchase_return' ? 'returned' : 'received';
        $this->pdo->prepare(
            'UPDATE docs SET stock_posted_at = ?, status = ?, updated_at = ? WHERE id = ?'
        )->execute([$now, $status, $now, $id]);
    }

    private function createNextDoc(
        array $doc,
        array $lines,
        string $nextType,
        string $now,
        ?array $overrideLines = null
    ): string
    {
        $companyId = $doc['company_id'];
        $number = $this->nextNumber($companyId, $nextType, '');
        $id = Helpers::cuid('doc');
        $body = [
            'partyId' => $doc['party_id'],
            'notes' => $doc['notes'],
            'terms' => $doc['terms'] ?? null,
            'validUntil' => $doc['valid_until'] ?? null,
            'followUpDate' => $doc['follow_up_date'] ?? null,
            'billingAddress' => $doc['billing_address'] ?? null,
            'stateOfSupply' => $doc['state_of_supply'] ?? null,
            'priceTaxMode' => $doc['price_tax_mode'] ?? 'without',
            'roundOff' => (int) ($doc['round_off'] ?? 1),
            'discountTotal' => (float) ($doc['discount_total'] ?? 0),
            'subtotal' => (float) $doc['subtotal'],
            'taxTotal' => (float) $doc['tax_total'],
            'grandTotal' => (float) $doc['grand_total'],
            'refNo' => $doc['ref_no'] ?? null,
        ];
        $this->insertDocRow($id, $companyId, $nextType, $number, $doc['date'], 'draft', $body, $now, null);

        $apiLines = $overrideLines ?? array_map(static function (array $l) use ($nextType): array {
            return [
                'itemId' => $l['item_id'] ?: null,
                'name' => $l['name'],
                'qty' => (float) $l['qty'],
                'rate' => (float) $l['rate'],
                'taxPercent' => (float) $l['tax_percent'],
                'discountPercent' => (float) ($l['discount_percent'] ?? 0),
                'unit' => $l['unit'] ?? null,
                'amount' => (float) $l['amount'],
                'receivedQty' => $nextType === 'grn'
                    ? (float) $l['qty']
                    : (($l['received_qty'] ?? null) !== null ? (float) $l['received_qty'] : null),
            ];
        }, $lines);
        $normalized = $this->normalizeDocMoney($nextType, $apiLines);
        $this->pdo->prepare(
            'UPDATE docs SET subtotal = ?, tax_total = ?, grand_total = ?, updated_at = ? WHERE id = ?'
        )->execute([
            $normalized['subtotal'],
            $normalized['taxTotal'],
            $normalized['grandTotal'],
            $now,
            $id,
        ]);
        $this->insertLines($companyId, $id, $normalized['lines']);
        return $id;
    }

    private function createInvoiceFromDoc(
        array $doc,
        array $lines,
        string $txnType,
        string $now,
        array $options = []
    ): string
    {
        $companyId = $doc['company_id'];
        $prefix = $txnType === 'sale' ? 'INV-' : 'PUR-';
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM transactions WHERE company_id = ? AND type = ?');
        $countStmt->execute([$companyId, $txnType]);
        $number = trim((string) ($options['invoiceNo'] ?? ''));
        if ($number === '') {
            $number = $prefix . (1000 + (int) $countStmt->fetchColumn() + 1);
        }
        $id = Helpers::cuid('txn');
        $paymentTypeId = $this->nullable($options['paymentTypeId'] ?? null);

        $notes = $doc['notes'];
        if (!empty($doc['terms'])) {
            $notes = trim((string) $notes);
            $notes = ($notes !== '' ? $notes . ' · ' : '') . 'T&C: ' . $doc['terms'];
        }

        $subtotal = 0.0;
        $taxTotal = 0.0;
        foreach ($lines as $line) {
            $qty = $txnType === 'purchase' && ($line['received_qty'] ?? null) !== null
                ? (float) $line['received_qty']
                : (float) $line['qty'];
            $base = $qty * (float) $line['rate'];
            $subtotal += $base;
            $taxTotal += $base * (float) $line['tax_percent'] / 100;
        }
        $grandTotal = $subtotal + $taxTotal;

        $this->pdo->prepare(
            'INSERT INTO transactions (
                id, company_id, type, number, date, party_id, payment_type_id, notes,
                subtotal, tax_total, grand_total, stock_effect, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id, $companyId, $txnType, $number, $doc['date'],
            $doc['party_id'], $paymentTypeId, $notes,
            $subtotal, $taxTotal, $grandTotal,
            $doc['doc_type'] === 'grn' ? 0 : 1,
            $now, $now,
        ]);

        $lineStmt = $this->pdo->prepare(
            'INSERT INTO line_items (id, company_id, transaction_id, item_id, name, qty, rate, tax_percent, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($lines as $line) {
            $qty = $txnType === 'purchase' && ($line['received_qty'] ?? null) !== null
                ? (float) $line['received_qty']
                : (float) $line['qty'];
            $lineStmt->execute([
                Helpers::cuid('li'), $companyId, $id,
                $line['item_id'] ?: null, $line['name'],
                $qty, (float) $line['rate'], (float) $line['tax_percent'],
                $qty * (float) $line['rate'] * (1 + (float) $line['tax_percent'] / 100),
            ]);
            if (!empty($line['item_id']) && $doc['doc_type'] !== 'grn') {
                $delta = $txnType === 'sale' ? -((float) $line['qty']) : (float) $line['qty'];
                $this->pdo->prepare('UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?')
                    ->execute([$delta, $now, $line['item_id']]);
            }
        }
        return $id;
    }

    /**
     * A sale invoice is also a confirmed sale order.
     * Skips invoices that already came from a sale order (order → delivery → invoice).
     *
     * @param array<string, mixed> $txn
     * @param array<int, array<string, mixed>> $dbLines
     */
    public function ensureConfirmedSaleOrder(array $txn, array $dbLines): void
    {
        if (($txn['type'] ?? '') !== 'sale') {
            return;
        }
        $txnId = (string) ($txn['id'] ?? '');
        if ($txnId === '' || $this->saleOrderCoversInvoice($txnId)) {
            return;
        }

        $companyId = (string) $txn['company_id'];
        $now = Helpers::now();
        $id = Helpers::cuid('doc');
        $number = $this->nextNumber($companyId, 'sale_order', '');
        $this->insertDocRow($id, $companyId, 'sale_order', $number, (string) $txn['date'], 'converted', [
            'partyId' => $txn['party_id'] ?? null,
            'notes' => $txn['notes'] ?? null,
            'subtotal' => (float) ($txn['subtotal'] ?? 0),
            'taxTotal' => (float) ($txn['tax_total'] ?? 0),
            'grandTotal' => (float) ($txn['grand_total'] ?? 0),
            'refNo' => $txn['number'] ?? null,
        ], $now, null);

        $apiLines = [];
        foreach ($dbLines as $line) {
            $qty = (float) ($line['qty'] ?? 0);
            $rate = (float) ($line['rate'] ?? 0);
            $apiLines[] = [
                'itemId' => $line['item_id'] ?? null,
                'name' => $line['name'] ?? '',
                'qty' => $qty,
                'rate' => $rate,
                'taxPercent' => (float) ($line['tax_percent'] ?? 0),
                'amount' => $qty * $rate,
            ];
        }
        if ($apiLines) {
            $this->insertLines($companyId, $id, $apiLines);
        }
        $this->pdo->prepare(
            'UPDATE docs SET converted_to_id = ?, converted_to_type = ?, updated_at = ? WHERE id = ?'
        )->execute([$txnId, 'sale', $now, $id]);
    }

    /** Keep the direct confirmed sale order in step with its invoice. */
    public function syncDirectSaleOrder(array $txn, array $dbLines): void
    {
        if (($txn['type'] ?? '') !== 'sale') {
            return;
        }
        $stmt = $this->pdo->prepare(
            'SELECT id FROM docs WHERE converted_to_id = ? AND doc_type = ? LIMIT 1'
        );
        $stmt->execute([(string) $txn['id'], 'sale_order']);
        $order = $stmt->fetch();
        if (!$order) {
            $this->ensureConfirmedSaleOrder($txn, $dbLines);
            return;
        }
        $now = Helpers::now();
        $this->pdo->prepare(
            'UPDATE docs SET date = ?, party_id = ?, notes = ?, subtotal = ?, tax_total = ?, grand_total = ?, ref_no = ?, updated_at = ? WHERE id = ?'
        )->execute([
            (string) $txn['date'],
            $txn['party_id'] ?? null,
            $txn['notes'] ?? null,
            (float) ($txn['subtotal'] ?? 0),
            (float) ($txn['tax_total'] ?? 0),
            (float) ($txn['grand_total'] ?? 0),
            $txn['number'] ?? null,
            $now,
            $order['id'],
        ]);
        $this->pdo->prepare('DELETE FROM doc_lines WHERE doc_id = ?')->execute([$order['id']]);
        $apiLines = [];
        foreach ($dbLines as $line) {
            $qty = (float) ($line['qty'] ?? 0);
            $rate = (float) ($line['rate'] ?? 0);
            $apiLines[] = [
                'itemId' => $line['item_id'] ?? null,
                'name' => $line['name'] ?? '',
                'qty' => $qty,
                'rate' => $rate,
                'taxPercent' => (float) ($line['tax_percent'] ?? 0),
                'amount' => $qty * $rate,
            ];
        }
        if ($apiLines) {
            $this->insertLines((string) $txn['company_id'], (string) $order['id'], $apiLines);
        }
    }

    private function saleOrderCoversInvoice(string $txnId): bool
    {
        $current = $txnId;
        for ($guard = 0; $guard < 6; $guard++) {
            $stmt = $this->pdo->prepare(
                'SELECT id, doc_type FROM docs WHERE converted_to_id = ? LIMIT 1'
            );
            $stmt->execute([$current]);
            $row = $stmt->fetch();
            if (!$row) {
                return false;
            }
            if (($row['doc_type'] ?? '') === 'sale_order') {
                return true;
            }
            $current = (string) $row['id'];
        }
        return false;
    }

    private function insertDocRow(
        string $id,
        string $companyId,
        string $docType,
        string $number,
        string $date,
        string $status,
        array $body,
        string $now,
        ?string $clonedFromId
    ): void {
        $this->pdo->prepare(
            'INSERT INTO docs (
                id, company_id, doc_type, number, date, party_id, status, notes,
                terms, valid_until, follow_up_date, billing_address, state_of_supply,
                price_tax_mode, round_off, discount_total, revision, cloned_from_id, ref_no,
                original_bill_no, subtotal, tax_total, grand_total, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id,
            $companyId,
            $docType,
            $number,
            $date,
            $this->nullable($body['partyId'] ?? null),
            $status,
            $this->nullable($body['notes'] ?? null),
            $this->nullable($body['terms'] ?? null),
            $this->nullable($body['validUntil'] ?? null),
            $this->nullable($body['followUpDate'] ?? null),
            $this->nullable($body['billingAddress'] ?? null),
            $this->nullable($body['stateOfSupply'] ?? null),
            (string) ($body['priceTaxMode'] ?? 'without'),
            !empty($body['roundOff'] ?? true) ? 1 : 0,
            (float) ($body['discountTotal'] ?? 0),
            1,
            $this->nullable($clonedFromId ?? ($body['clonedFromId'] ?? null)),
            $this->nullable($body['refNo'] ?? null),
            $this->nullable($body['originalBillNo'] ?? null),
            (float) ($body['subtotal'] ?? 0),
            (float) ($body['taxTotal'] ?? 0),
            (float) ($body['grandTotal'] ?? 0),
            $now,
            $now,
        ]);
    }

    /**
     * Recalculate line amounts + doc totals.
     * GRN bills on receivedQty; other docs use qty.
     *
     * @param array<int, array<string, mixed>> $lines
     * @return array{lines: array<int, array<string, mixed>>, subtotal: float, taxTotal: float, grandTotal: float}
     */
    private function normalizeDocMoney(string $docType, array $lines): array
    {
        $subtotal = 0.0;
        $taxTotal = 0.0;
        $normalized = [];
        foreach ($lines as $line) {
            $qty = (float) ($line['qty'] ?? 0);
            $rate = (float) ($line['rate'] ?? 0);
            $taxPercent = (float) ($line['taxPercent'] ?? $line['tax_percent'] ?? 0);
            $hasReceived = array_key_exists('receivedQty', $line) && $line['receivedQty'] !== null;
            $receivedQty = $hasReceived
                ? (float) $line['receivedQty']
                : (array_key_exists('received_qty', $line) && $line['received_qty'] !== null
                    ? (float) $line['received_qty']
                    : null);
            $billable = $docType === 'grn'
                ? (float) ($receivedQty ?? $qty)
                : $qty;
            $base = $billable * $rate;
            $subtotal += $base;
            $taxTotal += $base * $taxPercent / 100;
            $row = $line;
            $row['qty'] = $qty;
            $row['rate'] = $rate;
            $row['taxPercent'] = $taxPercent;
            // Amount is taxable (qty×rate); tax lives in taxTotal / grandTotal.
            $row['amount'] = $base;
            if ($docType === 'grn') {
                $row['receivedQty'] = $receivedQty ?? $qty;
            } elseif ($hasReceived || $receivedQty !== null) {
                $row['receivedQty'] = $receivedQty;
            }
            $normalized[] = $row;
        }
        return [
            'lines' => $normalized,
            'subtotal' => $subtotal,
            'taxTotal' => $taxTotal,
            'grandTotal' => $subtotal + $taxTotal,
        ];
    }

    private function insertLines(string $companyId, string $docId, array $lines): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO doc_lines (
                id, company_id, doc_id, item_id, name, qty, rate, tax_percent, amount,
                discount_percent, unit, received_qty
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
                (float) ($line['discountPercent'] ?? 0),
                $this->nullable($line['unit'] ?? null),
                array_key_exists('receivedQty', $line) && $line['receivedQty'] !== null
                    ? (float) $line['receivedQty']
                    : null,
            ]);
        }
    }

    private function saveRevision(
        string $companyId,
        string $docId,
        int $revision,
        ?string $changedBy,
        string $note
    ): void {
        $stmt = $this->pdo->prepare('SELECT * FROM docs WHERE id = ?');
        $stmt->execute([$docId]);
        $row = $stmt->fetch();
        if (!$row) {
            return;
        }
        $snapshot = $this->toApi($row, $this->linesFor($docId));
        $this->pdo->prepare(
            'INSERT INTO doc_revisions (id, company_id, doc_id, revision, snapshot, changed_by, change_note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            Helpers::cuid('drev'),
            $companyId,
            $docId,
            $revision,
            json_encode($snapshot, JSON_UNESCAPED_UNICODE),
            $changedBy,
            $note,
            Helpers::now(),
        ]);
    }

    private function expireOverdue(string $companyId, string $docType, ?string $onlyId = null): void
    {
        if ($docType !== 'quotation') {
            return;
        }
        $today = date('Y-m-d');
        if ($onlyId) {
            $stmt = $this->pdo->prepare(
                "UPDATE docs SET status = 'expired', updated_at = ?
                 WHERE id = ? AND company_id = ? AND doc_type = 'quotation'
                   AND valid_until IS NOT NULL AND valid_until < ?
                   AND status NOT IN ('converted','accepted','declined','expired')"
            );
            $stmt->execute([Helpers::now(), $onlyId, $companyId, $today]);
            return;
        }
        $stmt = $this->pdo->prepare(
            "UPDATE docs SET status = 'expired', updated_at = ?
             WHERE company_id = ? AND doc_type = 'quotation'
               AND valid_until IS NOT NULL AND valid_until < ?
               AND status NOT IN ('converted','accepted','declined','expired')"
        );
        $stmt->execute([Helpers::now(), $companyId, $today]);
    }

    private function nextNumber(string $companyId, string $docType, string $provided): string
    {
        if ($provided !== '') {
            return $provided;
        }
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM docs WHERE company_id = ? AND doc_type = ?');
        $countStmt->execute([$companyId, $docType]);
        return (self::PREFIX[$docType] ?? 'DOC-') . (1000 + (int) $countStmt->fetchColumn() + 1);
    }

    private function normalizeCreateStatus(string $docType, string $status): string
    {
        $status = strtolower(trim($status));
        if ($status === 'open' || $status === '') {
            $status = 'draft';
        }
        if ($docType === 'quotation') {
            return in_array($status, ['draft', 'sent'], true) ? $status : 'draft';
        }
        return in_array($status, ['draft', 'open'], true) ? 'draft' : 'draft';
    }

    private function normalizeLegacyStatus(string $status): string
    {
        $status = strtolower(trim($status));
        if ($status === 'open') {
            return 'draft';
        }
        return $status;
    }

    private function linesFor(string $docId): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM doc_lines WHERE doc_id = ?');
        $stmt->execute([$docId]);
        return $stmt->fetchAll();
    }

    private function toApi(array $row, array $lines = []): array
    {
        $fromStmt = $this->pdo->prepare(
            'SELECT id, doc_type, number FROM docs WHERE converted_to_id = ? LIMIT 1'
        );
        $fromStmt->execute([$row['id']]);
        $from = $fromStmt->fetch() ?: [];
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'docType' => $row['doc_type'],
            'number' => $row['number'],
            'date' => $row['date'],
            'partyId' => $row['party_id'] ?: null,
            'status' => $this->normalizeLegacyStatus((string) ($row['status'] ?? 'draft')),
            'notes' => $row['notes'] ?: null,
            'terms' => ($row['terms'] ?? null) ?: null,
            'validUntil' => ($row['valid_until'] ?? null) ?: null,
            'followUpDate' => ($row['follow_up_date'] ?? null) ?: null,
            'billingAddress' => ($row['billing_address'] ?? null) ?: null,
            'stateOfSupply' => ($row['state_of_supply'] ?? null) ?: null,
            'priceTaxMode' => $row['price_tax_mode'] ?? 'without',
            'roundOff' => (bool) ((int) ($row['round_off'] ?? 1)),
            'discountTotal' => (float) ($row['discount_total'] ?? 0),
            'revision' => (int) ($row['revision'] ?? 1),
            'clonedFromId' => ($row['cloned_from_id'] ?? null) ?: null,
            'refNo' => ($row['ref_no'] ?? null) ?: null,
            'originalBillNo' => ($row['original_bill_no'] ?? null) ?: null,
            'stockPostedAt' => ($row['stock_posted_at'] ?? null) ?: null,
            'subtotal' => (float) $row['subtotal'],
            'taxTotal' => (float) $row['tax_total'],
            'grandTotal' => (float) $row['grand_total'],
            'convertedToId' => $row['converted_to_id'] ?: null,
            'convertedToType' => $row['converted_to_type'] ?: null,
            'convertedFromId' => $from['id'] ?? null,
            'convertedFromType' => $from['doc_type'] ?? null,
            'convertedFromNumber' => $from['number'] ?? null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'] ?? null,
            'lines' => array_map(static function (array $l): array {
                return [
                    'id' => $l['id'],
                    'itemId' => $l['item_id'] ?: null,
                    'name' => $l['name'],
                    'qty' => (float) $l['qty'],
                    'rate' => (float) $l['rate'],
                    'taxPercent' => (float) $l['tax_percent'],
                    'discountPercent' => (float) ($l['discount_percent'] ?? 0),
                    'unit' => ($l['unit'] ?? null) ?: null,
                    'amount' => (float) $l['amount'],
                    'receivedQty' => ($l['received_qty'] ?? null) !== null
                        ? (float) $l['received_qty']
                        : null,
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
