<?php

declare(strict_types=1);

final class Helpers
{
    public static function cuid(string $prefix = ''): string
    {
        $id = bin2hex(random_bytes(8));
        return $prefix !== '' ? $prefix . '_' . $id : $id;
    }

    public static function now(): string
    {
        return gmdate('c');
    }

    public static function body(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function normalizeCountry(?string $value): string
    {
        $code = strtoupper(trim((string) $value));
        return $code === 'IN' ? 'IN' : 'AE';
    }

    public static function normalizeCurrency(?string $value, ?string $country = null): string
    {
        $code = strtoupper(trim((string) $value));
        if ($code === 'INR' || $code === 'AED') {
            return $code;
        }
        return self::normalizeCountry($country) === 'IN' ? 'INR' : 'AED';
    }

    public static function defaultTaxTypeForCountry(?string $country = null): string
    {
        return self::normalizeCountry($country) === 'IN' ? 'GST' : 'VAT';
    }

    public static function normalizeTaxType(?string $value, ?string $country = null): string
    {
        $code = strtoupper(trim((string) $value));
        if ($code === 'GST' || $code === 'VAT') {
            return $code;
        }
        return self::defaultTaxTypeForCountry($country);
    }

    public static function companyToApi(array $row): array
    {
        $country = self::normalizeCountry($row['country'] ?? 'AE');
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'phone' => $row['phone'],
            'email' => $row['email'] ?: null,
            'gstin' => $row['gstin'] ?: null,
            'address' => $row['address'] ?: null,
            'state' => $row['state'] ?: null,
            'country' => $country,
            'currency' => self::normalizeCurrency($row['currency'] ?? null, $country),
            'taxType' => self::normalizeTaxType($row['tax_type'] ?? null, $country),
            'logoUrl' => ($row['logo_url'] ?? null) ?: null,
            'signatureUrl' => ($row['signature_url'] ?? null) ?: null,
            'defaultTerms' => ($row['default_terms'] ?? null) ?: null,
            'assetTagStart' => ($row['asset_tag_start'] ?? null) ?: 'EQ-0001',
            'settings' => self::decodeCompanySettings($row['settings_json'] ?? null),
            'createdAt' => $row['created_at'],
        ];
    }

    /** @return array<string,mixed>|null */
    public static function decodeCompanySettings(mixed $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Validate and normalize company settings payload.
     * Ledger mapping is not used by this app, so any stored accounting block is dropped.
     * @param mixed $raw
     * @return array{ok:bool,settings?:array<string,mixed>,error?:string}
     */
    public static function normalizeCompanySettings(mixed $raw): array
    {
        if ($raw === null) {
            return ['ok' => true, 'settings' => null];
        }
        if (!is_array($raw)) {
            return ['ok' => false, 'error' => 'settings must be an object'];
        }

        unset($raw['accounting']);

        return ['ok' => true, 'settings' => $raw];
    }

    /** @return array{prefix:string,width:int,start:int} */
    public static function parseAssetTagPattern(?string $pattern): array
    {
        $text = strtoupper(trim((string) $pattern));
        if ($text === '') {
            $text = 'EQ-0001';
        }
        if (preg_match('/^(.*?)(\d+)$/', $text, $m)) {
            return [
                'prefix' => $m[1],
                'width' => strlen($m[2]),
                'start' => (int) $m[2],
            ];
        }
        $prefix = rtrim($text, '-') . '-';
        return ['prefix' => $prefix, 'width' => 3, 'start' => 1];
    }

    public static function formatAssetTag(string $prefix, int $number, int $width): string
    {
        $pad = max($width, strlen((string) $number));
        return $prefix . str_pad((string) $number, $pad, '0', STR_PAD_LEFT);
    }

    public static function nextAssetTag(PDO $pdo, string $companyId, ?string $pattern): string
    {
        $parsed = self::parseAssetTagPattern($pattern);
        $stmt = $pdo->prepare('SELECT asset_tag FROM equipment WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $next = $parsed['start'];
        $prefix = $parsed['prefix'];
        foreach ($stmt->fetchAll() as $row) {
            $tag = strtoupper(trim((string) $row['asset_tag']));
            if (!str_starts_with($tag, strtoupper($prefix))) {
                continue;
            }
            $suffix = substr($tag, strlen($prefix));
            if ($suffix !== '' && ctype_digit($suffix)) {
                $n = (int) $suffix;
                if ($n >= $next) {
                    $next = $n + 1;
                }
            }
        }
        return self::formatAssetTag($prefix, $next, $parsed['width']);
    }

    public static function normalizeAssetTagStart(?string $value): ?string
    {
        $text = strtoupper(trim((string) $value));
        if ($text === '') {
            return null;
        }
        if (!preg_match('/^[A-Z0-9]+(?:-[A-Z0-9]+)*-?\d*$/', $text)) {
            return $text;
        }
        $parsed = self::parseAssetTagPattern($text);
        return self::formatAssetTag($parsed['prefix'], $parsed['start'], $parsed['width']);
    }

    public static function partyToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'name' => $row['name'],
            'phone' => $row['phone'] ?: null,
            'email' => $row['email'] ?: null,
            'gstin' => $row['gstin'] ?: null,
            'type' => $row['type'],
            'typeOther' => ($row['type_other'] ?? null) ?: null,
            'contactPerson' => ($row['contact_person'] ?? null) ?: null,
            'city' => ($row['city'] ?? null) ?: null,
            'country' => ($row['country'] ?? null) ?: null,
            'licenseGst' => ($row['license_gst'] ?? null) ?: ($row['gstin'] ?? null) ?: null,
            'priceCategory' => ($row['price_category'] ?? null) ?: null,
            'deliveryAddress' => ($row['delivery_address'] ?? null) ?: null,
            'additionalFields' => self::decodeJsonList($row['additional_fields'] ?? null),
            'notes' => ($row['notes'] ?? null) ?: null,
            'openingBalance' => (float) $row['opening_balance'],
            'balanceType' => $row['balance_type'],
            'address' => $row['address'] ?: null,
            'createdAt' => $row['created_at'],
        ];
    }

    public static function equipmentToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'assetTag' => $row['asset_tag'],
            'name' => $row['name'],
            'model' => ($row['model'] ?? null) ?: null,
            'manufacturer' => ($row['manufacturer'] ?? null) ?: null,
            'category' => ($row['category'] ?? null) ?: null,
            'serialNumber' => $row['serial_number'],
            'customerId' => ($row['customer_id'] ?? null) ?: null,
            'customerName' => ($row['customer_name'] ?? null) ?: null,
            'location' => ($row['location'] ?? null) ?: null,
            'installDate' => ($row['install_date'] ?? null) ?: null,
            'warrantyStart' => ($row['warranty_start'] ?? null) ?: null,
            'warrantyEnd' => ($row['warranty_end'] ?? null) ?: null,
            'noMachineWarranty' => (bool) (int) ($row['no_machine_warranty'] ?? 0),
            'serviceWarrantyStart' => ($row['service_warranty_start'] ?? null) ?: null,
            'serviceWarrantyEnd' => ($row['service_warranty_end'] ?? null) ?: null,
            'noServiceWarranty' => (bool) (int) ($row['no_service_warranty'] ?? 0),
            'condition' => ($row['condition'] ?? null) ?: null,
            'currentStatus' => ($row['current_status'] ?? 'in_service') ?: 'in_service',
            'additionalNote' => ($row['additional_note'] ?? null) ?: null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    public static function nextServiceCallNo(PDO $pdo, string $companyId): string
    {
        $prefix = 'SC-';
        $stmt = $pdo->prepare('SELECT call_no FROM service_calls WHERE company_id = ?');
        $stmt->execute([$companyId]);
        $next = 1001;
        foreach ($stmt->fetchAll() as $row) {
            $tag = strtoupper(trim((string) $row['call_no']));
            if (!str_starts_with($tag, $prefix)) {
                continue;
            }
            $suffix = substr($tag, strlen($prefix));
            if ($suffix !== '' && ctype_digit($suffix)) {
                $n = (int) $suffix;
                if ($n >= $next) {
                    $next = $n + 1;
                }
            }
        }
        return $prefix . (string) $next;
    }

    /** @return list<mixed> */
    public static function decodeJsonList($value): array
    {
        if ($value === null || $value === '') {
            return [];
        }
        if (is_array($value)) {
            return array_values($value);
        }
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? array_values($decoded) : [];
    }

    public static function encodeJsonList($value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value)) {
            return null;
        }
        $json = json_encode(array_values($value), JSON_UNESCAPED_UNICODE);
        return $json === false ? null : $json;
    }

    /** Map legacy statuses onto the 6-stage pipeline. */
    public static function normalizeServiceCallStatusValue($value): string
    {
        $allowed = ['open', 'inspection', 'estimate', 'in_progress', 'qa', 'billing', 'closed'];
        $status = strtolower(trim((string) $value));
        $status = str_replace([' ', '-'], '_', $status);
        if ($status === 'inprogress') {
            $status = 'in_progress';
        }
        // Legacy aliases
        if ($status === 'assigned') {
            $status = 'inspection';
        }
        if ($status === 'done' || $status === 'complete' || $status === 'completed') {
            $status = 'billing';
        }
        return in_array($status, $allowed, true) ? $status : 'open';
    }

    public static function serviceCallToApi(array $row): array
    {
        $status = self::normalizeServiceCallStatusValue($row['status'] ?? 'open');
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'callNo' => $row['call_no'],
            'customerId' => $row['customer_id'],
            'customerName' => $row['customer_name'],
            'equipmentId' => ($row['equipment_id'] ?? null) ?: null,
            'equipmentName' => ($row['equipment_name'] ?? null) ?: null,
            'equipmentIds' => self::decodeJsonList($row['equipment_ids_json'] ?? null),
            'type' => ($row['type'] ?? 'Repair') ?: 'Repair',
            'priority' => ($row['priority'] ?? 'normal') ?: 'normal',
            'status' => $status,
            'description' => $row['description'] ?? '',
            'assignedUserId' => ($row['assigned_user_id'] ?? null) ?: null,
            'assignedName' => ($row['assigned_name'] ?? null) ?: null,
            'inspectorId' => ($row['inspector_id'] ?? null) ?: null,
            'inspectorName' => ($row['inspector_name'] ?? null) ?: null,
            'inspectionDate' => ($row['inspection_date'] ?? null) ?: null,
            'findings' => ($row['findings'] ?? null) ?: null,
            'severity' => ($row['severity'] ?? null) ?: null,
            'recommendation' => ($row['recommendation'] ?? null) ?: null,
            'recommendationNotes' => ($row['recommendation_notes'] ?? null) ?: null,
            'workRequired' => ($row['work_required'] ?? null) ?: null,
            'workDetails' => ($row['work_details'] ?? null) ?: null,
            'requestedParts' => ($row['requested_parts'] ?? null) ?: null,
            'inspectorSignature' => ($row['inspector_signature'] ?? null) ?: null,
            'inspectionPhotos' => self::decodeJsonList($row['inspection_photos_json'] ?? null),
            'engineerUserId' => ($row['engineer_user_id'] ?? null) ?: null,
            'engineerName' => ($row['engineer_name'] ?? null) ?: null,
            'estimateLines' => self::decodeJsonList($row['estimate_lines_json'] ?? null),
            'estimateDiscount' => (float) ($row['estimate_discount'] ?? 0),
            'estimateNotes' => ($row['estimate_notes'] ?? null) ?: null,
            'estimateFinalizedAt' => ($row['estimate_finalized_at'] ?? null) ?: null,
            'partsUsed' => self::decodeJsonList($row['parts_used_json'] ?? null),
            'servicePhotos' => self::decodeJsonList($row['service_photos_json'] ?? null),
            'customerHandoff' => !empty($row['customer_handoff']),
            'customerReceiverName' => ($row['customer_receiver_name'] ?? null) ?: null,
            'customerSignature' => ($row['customer_signature'] ?? null) ?: null,
            'qaDecision' => ($row['qa_decision'] ?? null) ?: null,
            'qaRemarks' => ($row['qa_remarks'] ?? null) ?: null,
            'qaVerifiedBy' => ($row['qa_verified_by'] ?? null) ?: null,
            'qaVerifiedByName' => ($row['qa_verified_by_name'] ?? null) ?: null,
            'qaVerifiedAt' => ($row['qa_verified_at'] ?? null) ?: null,
            'scheduledFor' => ($row['scheduled_for'] ?? null) ?: null,
            'notes' => ($row['notes'] ?? null) ?: null,
            'invoiceDocId' => ($row['invoice_doc_id'] ?? null) ?: null,
            'completedAt' => ($row['completed_at'] ?? null) ?: null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    public static function notificationToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'userId' => $row['user_id'],
            'title' => $row['title'],
            'body' => ($row['body'] ?? null) ?: null,
            'link' => ($row['link'] ?? null) ?: null,
            'kind' => ($row['kind'] ?? null) ?: null,
            'refId' => ($row['ref_id'] ?? null) ?: null,
            'readAt' => ($row['read_at'] ?? null) ?: null,
            'createdAt' => $row['created_at'],
        ];
    }

    public static function nextServiceVisitNo(PDO $pdo, string $serviceCallId): string
    {
        $stmt = $pdo->prepare('SELECT visit_no FROM service_visits WHERE service_call_id = ?');
        $stmt->execute([$serviceCallId]);
        $next = 1;
        foreach ($stmt->fetchAll() as $row) {
            $tag = strtoupper(trim((string) $row['visit_no']));
            if (preg_match('/^V-?(\d+)$/', $tag, $m)) {
                $n = (int) $m[1];
                if ($n >= $next) {
                    $next = $n + 1;
                }
            }
        }
        return 'V-' . (string) $next;
    }

    public static function serviceVisitToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'serviceCallId' => $row['service_call_id'],
            'visitNo' => $row['visit_no'],
            'visitDate' => $row['visit_date'],
            'assignedUserId' => ($row['assigned_user_id'] ?? null) ?: null,
            'assignedName' => ($row['assigned_name'] ?? null) ?: null,
            'status' => ($row['status'] ?? 'planned') ?: 'planned',
            'workDone' => ($row['work_done'] ?? null) ?: null,
            'notes' => ($row['notes'] ?? null) ?: null,
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    public static function itemToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'name' => $row['name'],
            'sku' => $row['sku'] ?: null,
            'unit' => $row['unit'],
            'salePrice' => (float) $row['sale_price'],
            'purchasePrice' => (float) $row['purchase_price'],
            'stockQty' => (float) $row['stock_qty'],
            'taxPercent' => (float) $row['tax_percent'],
            'category' => $row['category'] ?: null,
            'itemType' => (($row['item_type'] ?? 'product') === 'service') ? 'service' : 'product',
            'imageUrl' => ($row['image_url'] ?? null) ?: null,
            'createdAt' => $row['created_at'],
        ];
    }

    public static function paymentToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'name' => $row['name'],
            'kind' => $row['kind'],
            'openingBalance' => (float) $row['opening_balance'],
        ];
    }

    public static function lineToApi(array $row): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'transactionId' => $row['transaction_id'],
            'itemId' => $row['item_id'] ?: null,
            'name' => $row['name'],
            'qty' => (float) $row['qty'],
            'rate' => (float) $row['rate'],
            'taxPercent' => (float) $row['tax_percent'],
            'amount' => (float) $row['amount'],
        ];
    }

    public static function txnToApi(array $row, array $lines = []): array
    {
        return [
            'id' => $row['id'],
            'companyId' => $row['company_id'],
            'type' => $row['type'],
            'number' => $row['number'],
            'date' => $row['date'],
            'partyId' => $row['party_id'] ?: null,
            'paymentTypeId' => $row['payment_type_id'] ?: null,
            'notes' => $row['notes'] ?: null,
            'subtotal' => (float) $row['subtotal'],
            'taxTotal' => (float) $row['tax_total'],
            'grandTotal' => (float) $row['grand_total'],
            'createdAt' => $row['created_at'],
            'lineItems' => array_map([self::class, 'lineToApi'], $lines),
        ];
    }

    public static function encodeAdditionalFields($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $rows = is_string($value) ? self::decodeJsonList($value) : (is_array($value) ? $value : []);
        $clean = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $label = trim((string) ($row['label'] ?? ''));
            $val = trim((string) ($row['value'] ?? ''));
            if ($label === '' && $val === '') {
                continue;
            }
            $clean[] = ['label' => $label, 'value' => $val];
        }
        return $clean ? json_encode($clean) : null;
    }

    public static function slug(string $value): string
    {
        $text = strtolower(trim($value));
        $text = preg_replace('/[^a-z0-9]+/', '_', $text) ?? '';
        return trim($text, '_');
    }
}
