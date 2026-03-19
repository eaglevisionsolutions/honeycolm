<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/vendor/autoload.php';

use App\Config\Env;
use App\Middleware\CorsMiddleware;

Env::load();

// CORS must run before anything else
(new CorsMiddleware())->handle();

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip /api/v1 prefix
$path = preg_replace('#^/api/v1#', '', $uri) ?? $uri;
$path = rtrim($path, '/') ?: '/';

// -------------------------
// Route definitions
// -------------------------
$routes = [
    'POST /auth/login'    => [\App\Controllers\AuthController::class, 'login'],
    'POST /auth/register' => [\App\Controllers\AuthController::class, 'register'],
    'POST /auth/refresh'  => [\App\Controllers\AuthController::class, 'refresh'],
    'POST /auth/logout'   => [\App\Controllers\AuthController::class, 'logout'],

    // Admin auth routes
    'POST /admin/auth/login'  => [\App\Controllers\AdminAuthController::class, 'login'],
    'POST /admin/auth/logout' => [\App\Controllers\AdminAuthController::class, 'logout'],

    // Region routes (public)
    'GET /regions' => [\App\Controllers\RegionController::class, 'index'],

    // Product catalog routes (admin-only)
    'GET /admin/products'                              => [\App\Controllers\ProductController::class, 'index'],
    'GET /admin/products/{id}'                         => [\App\Controllers\ProductController::class, 'show'],
    'POST /admin/products'                             => [\App\Controllers\ProductController::class, 'store'],
    'PUT /admin/products/{id}'                         => [\App\Controllers\ProductController::class, 'update'],
    'POST /admin/products/{id}/images'                 => [\App\Controllers\ProductController::class, 'addImage'],
    'DELETE /admin/products/{id}/images/{imageId}'     => [\App\Controllers\ProductController::class, 'deleteImage'],

    // Swarm member-facing routes (GET = public, POST /combs = protected)
    'GET /swarms'                    => [\App\Controllers\SwarmController::class, 'index'],
    'GET /swarms/{id}'               => [\App\Controllers\SwarmController::class, 'show'],
    'POST /swarms/{id}/combs'        => [\App\Controllers\SwarmController::class, 'purchaseCombs'],
    'GET /swarms/{id}/odds'          => [\App\Controllers\SwarmController::class, 'odds'],
    'GET /swarms/{id}/result'        => [\App\Controllers\DrawController::class, 'publicResult'],

    // Swarm admin routes (all protected by AdminAuthMiddleware)
    'GET /admin/swarms'              => [\App\Controllers\AdminSwarmController::class, 'index'],
    'GET /admin/swarms/{id}'         => [\App\Controllers\AdminSwarmController::class, 'show'],
    'POST /admin/swarms'             => [\App\Controllers\AdminSwarmController::class, 'store'],
    'PUT /admin/swarms/{id}'         => [\App\Controllers\AdminSwarmController::class, 'update'],
    'POST /admin/swarms/{id}/publish' => [\App\Controllers\AdminSwarmController::class, 'publish'],
    'POST /admin/swarms/{id}/cancel'  => [\App\Controllers\AdminSwarmController::class, 'cancel'],

    // Draw admin routes (AdminAuthMiddleware)
    'GET /admin/draws'                   => [\App\Controllers\DrawController::class, 'adminIndex'],
    'GET /admin/draws/{swarmId}'         => [\App\Controllers\DrawController::class, 'adminShow'],
    'PUT /admin/draws/{swarmId}/shipped' => [\App\Controllers\DrawController::class, 'markShipped'],

    // Wallet routes (member auth required)
    'GET /wallet'              => [\App\Controllers\WalletController::class, 'balance'],
    'GET /wallet/transactions' => [\App\Controllers\WalletController::class, 'transactions'],

    // Payment routes
    'POST /payment/checkout'   => [\App\Controllers\PaymentController::class, 'checkout'],
    'POST /payment/webhook'    => [\App\Controllers\PaymentController::class, 'webhook'],
    'POST /payment/withdrawal' => [\App\Controllers\PaymentController::class, 'requestWithdrawal'],
];

// Admin routes that are public (no AdminAuthMiddleware required)
$adminPublicRoutes = [
    'POST /admin/auth/login',
];

// -------------------------
// Route matching (supports {id} placeholders)
// -------------------------
$routeKey = "{$method} {$path}";
$params   = [];

$matched = $routes[$routeKey] ?? null;

if (!$matched) {
    foreach ($routes as $pattern => $handler) {
        $regex = preg_replace('#\{[^/]+\}#', '([^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';

        if (preg_match($regex, $routeKey, $m)) {
            array_shift($m);
            $params  = $m;
            $matched = $handler;
            break;
        }
    }
}

if (!$matched) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Endpoint not found']);
    exit;
}

// Run AdminAuthMiddleware for protected /admin/* routes
$routePattern = array_search($matched, $routes);
if (
    is_string($routePattern)
    && str_contains($routePattern, '/admin/')
    && !in_array($routePattern, $adminPublicRoutes, true)
) {
    (new \App\Middleware\AdminAuthMiddleware())->handle();
}

// Run AuthMiddleware for member-protected routes
$memberProtectedRoutes = [
    'POST /swarms/{id}/combs',
    'GET /wallet',
    'GET /wallet/transactions',
    'POST /payment/checkout',
    'POST /payment/withdrawal',
];
if (is_string($routePattern) && in_array($routePattern, $memberProtectedRoutes, true)) {
    (new \App\Middleware\AuthMiddleware())->handle();
}

[$controllerClass, $method] = $matched;
$controller = new $controllerClass();
$controller->$method(...$params);
