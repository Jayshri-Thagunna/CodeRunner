<?php

declare(strict_types=1);

require_once __DIR__ . '/session_repository.php';

$token = (string) ($_COOKIE['session_token'] ?? '');
$session = $token !== '' ? getSessionByToken($token) : null;

if (!$session) {
    header('Location: /login.php');
    exit;
}

touchSession($token);
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CodeRunner Dashboard</title>
</head>
<body>
    <main>
        <h1>Welcome <?php echo htmlspecialchars((string) $session['display_name'], ENT_QUOTES, 'UTF-8'); ?></h1>
        <p>User ID: <?php echo (int) $session['user_id']; ?></p>
        <p>Expires At: <?php echo htmlspecialchars((string) $session['expires_at'], ENT_QUOTES, 'UTF-8'); ?></p>
    </main>
</body>
</html>
