<?php

declare(strict_types=1);

date_default_timezone_set('UTC');

function appConfig(): array
{
    return [
        'db_host' => '127.0.0.1',
        'db_port' => 3306,
        'db_name' => 'coderunner_sessions',
        'db_user' => 'root',
        'db_pass' => '',
        'session_ttl' => 3600,
    ];
}

function appNow(): string
{
    return date('Y-m-d H:i:s');
}
