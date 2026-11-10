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
            'createdAt' => $row['created_at'],
        ];
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
            'openingBalance' => (float) $row['opening_balance'],
            'balanceType' => $row['balance_type'],
            'address' => $row['address'] ?: null,
            'createdAt' => $row['created_at'],
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
}
