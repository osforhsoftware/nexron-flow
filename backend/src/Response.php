<?php

declare(strict_types=1);

final class Response
{
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $message, int $status = 400, $extra = null): void
    {
        $payload = ['error' => $message];
        if ($extra !== null) {
            $payload['details'] = $extra;
        }
        self::json($payload, $status);
    }
}
