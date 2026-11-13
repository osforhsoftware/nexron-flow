<?php
declare(strict_types=1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Authorization, Content-Type");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
    http_response_code(204);
    exit;
}

require_once __DIR__ . "/src/Response.php";
require_once __DIR__ . "/src/Database.php";
require_once __DIR__ . "/src/Schema.php";
require_once __DIR__ . "/src/Helpers.php";
require_once __DIR__ . "/src/Rbac.php";
require_once __DIR__ . "/src/Roles.php";
require_once __DIR__ . "/src/Auth.php";
require_once __DIR__ . "/src/Docs.php";
require_once __DIR__ . "/src/ApiRbac.php";
require_once __DIR__ . "/src/Backup.php";
require_once __DIR__ . "/src/Api.php";

try {
    $config = require __DIR__ . "/config/config.php";
    $pdo = Database::pdo($config);
    Schema::migrate($pdo);

    $uri = parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH) ?: "/";
    $uri = preg_replace("#^/mems-backend#", "", $uri) ?: "/";
    $uri = preg_replace("#^/(index|app|serve|run-api|server)\\.php#", "", $uri) ?: "/";

    $api = new Api($pdo, $config);
    $api->handle($_SERVER["REQUEST_METHOD"] ?? "GET", $uri);
} catch (Throwable $e) {
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=utf-8");
        header("Access-Control-Allow-Origin: *");
    }
    $payload = ["error" => "Server error"];
    $config = isset($config) && is_array($config) ? $config : [];
    if (($config["env"] ?? "local") !== "production") {
        $payload["details"] = $e->getMessage();
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
