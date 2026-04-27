<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

function createSession(int $userId, string $ip, string $userAgent): string
{
    $token = bin2hex(random_bytes(24));
    $config = appConfig();
    $expiresAt = date('Y-m-d H:i:s', time() + (int) $config['session_ttl']);

    $sql = 'INSERT INTO php_sessions (session_token, user_id, ip_address, user_agent, expires_at, created_at, updated_at)
            VALUES (:token, :user_id, :ip, :ua, :expires_at, NOW(), NOW())';

    $stmt = dbConnection()->prepare($sql);
    $stmt->execute([
        ':token' => $token,
        ':user_id' => $userId,
        ':ip' => $ip,
        ':ua' => $userAgent,
        ':expires_at' => $expiresAt,
    ]);

    return $token;
}

function getSessionByToken(string $token): ?array
{
    $sql = 'SELECT s.session_token, s.user_id, s.ip_address, s.user_agent, s.expires_at, u.email, u.display_name
            FROM php_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.session_token = :token AND s.is_revoked = 0 LIMIT 1';

    $stmt = dbConnection()->prepare($sql);
    $stmt->execute([':token' => $token]);
    $session = $stmt->fetch();

    if (!$session) {
        return null;
    }

    if (strtotime($session['expires_at']) < time()) {
        revokeSession($token);
        return null;
    }

    return $session;
}

function touchSession(string $token): bool
{
    $config = appConfig();
    $expiresAt = date('Y-m-d H:i:s', time() + (int) $config['session_ttl']);

    $sql = 'UPDATE php_sessions SET expires_at = :expires_at, updated_at = NOW() WHERE session_token = :token AND is_revoked = 0';
    $stmt = dbConnection()->prepare($sql);
    $stmt->execute([
        ':expires_at' => $expiresAt,
        ':token' => $token,
    ]);

    return $stmt->rowCount() > 0;
}

function revokeSession(string $token): bool
{
    $sql = 'UPDATE php_sessions SET is_revoked = 1, updated_at = NOW() WHERE session_token = :token';
    $stmt = dbConnection()->prepare($sql);
    $stmt->execute([':token' => $token]);

    return $stmt->rowCount() > 0;
}
