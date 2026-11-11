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
            'logoUrl' => ($row['logo_url'] ?? null) ?: null,
            'signatureUrl' => ($row['signature_url'] ?? null) ?: null,
            'defaultTerms' => ($row['default_terms'] ?? null) ?: null,
            'assetTagStart' => ($row['asset_tag_start'] ?? null) ?: 'EQ-0001',
            'createdAt' => $row['created_at'],
        ];
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

    public static function decodeJsonList($value): array
    {
        if ($value === null || $value === '') {
            return [];
        }
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : [];
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
