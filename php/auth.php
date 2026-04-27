<?php

declare(strict_types=1);

require_once __DIR__ . '/session_repository.php';

function loginUser(string $email, string $password, string $ip, string $userAgent): array
{
    $sql = 'SELECT id, email, password_hash, display_name, is_active FROM users WHERE email = :email LIMIT 1';
    $stmt = dbConnection()->prepare($sql);
    $stmt->execute([':email' => $email]);

    $user = $stmt->fetch();
    if (!$user || (int) $user['is_active'] !== 1) {
        return ['ok' => false, 'message' => 'User not found'];
    }

    if (!password_verify($password, $user['password_hash'])) {
        return ['ok' => false, 'message' => 'Invalid credentials'];
    }

    $token = createSession((int) $user['id'], $ip, $userAgent);

    return [
        'ok' => true,
        'token' => $token,
        'user' => [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'display_name' => $user['display_name'],
        ],
    ];
}

function logoutUser(string $token): array
{
    if ($token === '') {
        return ['ok' => false, 'message' => 'Missing token'];
    }

    $revoked = revokeSession($token);
    return ['ok' => $revoked];
}
