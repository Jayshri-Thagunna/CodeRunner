<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input') ?: '{}', true);

if (!is_array($input)) {
    $input = [];
}

if ($method === 'POST' && $path === 'login') {
    $email = (string) ($input['email'] ?? '');
    $password = (string) ($input['password'] ?? '');
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    $userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown');

    echo json_encode(loginUser($email, $password, $ip, $userAgent));
    exit;
}

if ($method === 'POST' && $path === 'validate') {
    $token = (string) ($input['token'] ?? '');
    $session = getSessionByToken($token);

    if (!$session) {
        echo json_encode(['ok' => false]);
        exit;
    }

    touchSession($token);

    echo json_encode([
        'ok' => true,
        'session' => [
            'token' => $session['session_token'],
            'user_id' => (int) $session['user_id'],
            'email' => $session['email'],
            'display_name' => $session['display_name'],
            'expires_at' => $session['expires_at'],
        ],
    ]);
    exit;
}

if ($method === 'POST' && $path === 'logout') {
    $token = (string) ($input['token'] ?? '');
    echo json_encode(logoutUser($token));
    exit;
}

http_response_code(404);
echo json_encode(['ok' => false, 'message' => 'Route not found']);
