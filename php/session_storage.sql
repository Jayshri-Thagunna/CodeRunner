CREATE DATABASE IF NOT EXISTS coderunner_sessions;
USE coderunner_sessions;

DROP TABLE IF EXISTS session_events;
DROP TABLE IF EXISTS php_sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE php_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_token VARCHAR(128) NOT NULL UNIQUE,
    user_id INT UNSIGNED NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    is_revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_is_revoked (is_revoked),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE session_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    event_payload JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_event_type (event_type),
    CONSTRAINT fk_events_session FOREIGN KEY (session_id) REFERENCES php_sessions(id) ON DELETE CASCADE
);

INSERT INTO users (email, password_hash, display_name, is_active) VALUES
('demo@coderunner.dev', '$2y$10$SCfQCWGYR5HTN58x8N9UVuDMf9E6cLZWYgaQkAZQWv0vAm7xBxRwS', 'Demo User', 1),
('qa@coderunner.dev', '$2y$10$SCfQCWGYR5HTN58x8N9UVuDMf9E6cLZWYgaQkAZQWv0vAm7xBxRwS', 'QA Analyst', 1);

INSERT INTO php_sessions (session_token, user_id, ip_address, user_agent, expires_at, is_revoked) VALUES
('sess_demo_7fd2cd118a5b4ef59c1c023f9a997301', 1, '127.0.0.1', 'Mozilla/5.0 Mock Browser', DATE_ADD(NOW(), INTERVAL 1 HOUR), 0),
('sess_qa_4bf8a2e4a4ab413eb5f8ee7d89d9011f', 2, '127.0.0.1', 'Mozilla/5.0 Mock Browser', DATE_ADD(NOW(), INTERVAL 2 HOUR), 0);

INSERT INTO session_events (session_id, event_type, event_payload) VALUES
(1, 'login', JSON_OBJECT('source', 'web', 'status', 'success')),
(1, 'validate', JSON_OBJECT('action', 'heartbeat')),
(2, 'login', JSON_OBJECT('source', 'api', 'status', 'success'));

SELECT u.id, u.email, s.session_token, s.expires_at, s.is_revoked
FROM users u
INNER JOIN php_sessions s ON s.user_id = u.id
ORDER BY s.id DESC;
