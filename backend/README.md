# Browser IDE — Backend

Node.js + Express backend that persists project files and executes real PHP inside
ephemeral Docker containers. Designed to back a browser-based IDE (Monaco editor,
file tree, Run button, iframe preview).

---

## Architecture

```
Browser (frontend)
      │  HTTP / REST
      ▼
Express API  (Node 20, port 3001)
      │  docker run  (sibling container via Docker socket)
      ▼
php:8.2-cli-alpine  ──  read-only workspace mount, no network, strict limits
      │  stdout / stderr
      ▼
Express API  ──  JSON response  ──►  Browser
```

Per-session workspaces are stored as plain directories under `WORKSPACE_ROOT`.
The API server is stateless; all state lives on disk.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| Docker | 24+ (with `docker` CLI on PATH) |
| Docker Compose | v2 |

---

## Quick Start (Docker Compose)

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd browser-ide-backend

# 2. Copy env config
cp .env.example .env
# Edit .env if needed (defaults work out of the box)

# 3. Pull the PHP image ahead of time (optional but speeds up first run)
docker pull php:8.2-cli-alpine

# 4. Start the backend
docker compose up --build

# API is now available at http://localhost:3001
```

---

## Quick Start (Local / No Docker Compose)

```bash
npm install

# Make sure Docker is running on your machine
cp .env.example .env

npm start
# or for auto-reload during development:
npm run dev
```

---

## Running Tests

```bash
# Filename validation tests (no Docker needed)
node --test tests/filename-validation.test.js

# Runner tests (require Docker)
node --test tests/runner.test.js

# All tests
npm test
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |
| `WORKSPACE_ROOT` | `/tmp/ide-workspaces` | Where session dirs are stored |
| `PHP_IMAGE` | `php:8.2-cli-alpine` | Docker image for PHP execution |
| `EXEC_TIMEOUT_MS` | `5000` | Max PHP run time before kill |
| `CONTAINER_MEMORY` | `64m` | Memory limit per container |
| `CONTAINER_CPUS` | `0.5` | CPU quota per container |
| `RUN_RATE_LIMIT_MAX` | `10` | Max `/api/run` calls per IP/min |

---

## API Reference

Base URL: `http://localhost:3001`

All request bodies are JSON (`Content-Type: application/json`).
All error responses follow: `{ "error": "...", "code": "SCREAMING_SNAKE" }`.

---

### POST /api/sessions

Create a new session. Returns a `sessionId` and the starter files written to disk.

**Request**
```http
POST /api/sessions
```
No body required.

**Response `201`**
```json
{
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "files": [
    { "name": "index.php",     "size": 152 },
    { "name": "functions.php", "size": 98  }
  ]
}
```

**Error codes**
| Code | Status | Meaning |
|------|--------|---------|
| `INTERNAL_ERROR` | 500 | Disk write failed |

---

### GET /api/files?sessionId=\<id\>

List all files in a session.

**Request**
```http
GET /api/files?sessionId=f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Response `200`**
```json
{
  "files": [
    {
      "name": "index.php",
      "size": 152,
      "updatedAt": "2026-04-10T12:00:00.000Z"
    },
    {
      "name": "functions.php",
      "size": 98,
      "updatedAt": "2026-04-10T12:00:00.000Z"
    }
  ]
}
```

**Error codes**
| Code | Status | Meaning |
|------|--------|---------|
| `BAD_REQUEST` | 400 | Missing `sessionId` |
| `INVALID_SESSION` | 400 | Malformed UUID |
| `SESSION_NOT_FOUND` | 404 | No session with that ID |

---

### GET /api/files/:name?sessionId=\<id\>

Read a single file's content.

**Request**
```http
GET /api/files/index.php?sessionId=f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Response `200`**
```json
{
  "name": "index.php",
  "content": "<?php\necho \"<h1>Hello from PHP \" . PHP_VERSION . \"!</h1>\";\n"
}
```

**Error codes**
| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_FILENAME` | 400 | Filename fails validation |
| `PATH_TRAVERSAL` | 400 | Traversal attempt detected |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `FILE_NOT_FOUND` | 404 | File does not exist in session |

---

### POST /api/files

Create a new file. Rejects duplicates unless `overwrite: true`.

**Request**
```json
{
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "filename": "utils.php",
  "content": "<?php\nfunction add(int $a, int $b): int { return $a + $b; }\n",
  "overwrite": false
}
```

**Response `201`**
```json
{
  "name": "utils.php",
  "size": 57
}
```

**Error codes**
| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_FILENAME` | 400 | Filename fails validation |
| `PATH_TRAVERSAL` | 400 | Traversal attempt detected |
| `FILE_EXISTS` | 409 | File already exists; send `overwrite: true` to replace |
| `FILE_TOO_LARGE` | 413 | Content exceeds `MAX_FILE_SIZE_BYTES` |
| `WORKSPACE_TOO_LARGE` | 413 | Session total exceeds `MAX_WORKSPACE_SIZE_BYTES` |
| `TOO_MANY_FILES` | 400 | Session has reached `MAX_FILES_PER_SESSION` |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |

---

### PUT /api/files/:name

Save (overwrite) an existing file. Creates it if it doesn't exist yet.

**Request**
```json
{
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "content": "<?php\necho \"<h1>Updated!</h1>\";\n"
}
```

**Response `200`**
```json
{
  "name": "index.php",
  "size": 31
}
```

**Error codes** — same as POST /api/files except `FILE_EXISTS` (always overwrites).

---

### POST /api/run

Execute a PHP file inside an isolated Docker container.

**Request**
```json
{
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "entryFile": "index.php"
}
```
`entryFile` defaults to `"index.php"` if omitted.

**Response `200` — success**
```json
{
  "html": "<h1>Hello from PHP 8.2.0!</h1>\n<p>Edit this file and click <strong>Run</strong> to see your output.</p>\n",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 312,
  "timedOut": false
}
```

**Response `200` — timeout**
```json
{
  "html": "",
  "stderr": "",
  "exitCode": 124,
  "durationMs": 5003,
  "timedOut": true
}
```

**Response `200` — PHP error**
```json
{
  "html": "",
  "stderr": "PHP Parse error:  syntax error, unexpected token \"echo\" in /workspace/index.php on line 3",
  "exitCode": 255,
  "durationMs": 89,
  "timedOut": false
}
```

> Note: `/api/run` always returns HTTP 200. Execution failures are communicated
> via `exitCode`, `stderr`, and `timedOut` — not HTTP error codes. This lets the
> frontend render PHP errors in the preview panel without treating them as network
> failures.

**Error codes** (HTTP errors, not execution errors)
| Code | Status | Meaning |
|------|--------|---------|
| `BAD_REQUEST` | 400 | Missing `sessionId` or invalid `entryFile` |
| `INVALID_FILENAME` | 400 | `entryFile` fails validation |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `RATE_LIMITED` | 429 | Too many run requests from this IP |

---

### GET /health

Liveness check.

**Response `200`**
```json
{ "status": "ok" }
```

---

## Security Model

| Control | Implementation |
|---------|---------------|
| Network isolation | `--network=none` |
| Capability drop | `--cap-drop=ALL` |
| No privilege escalation | `--security-opt=no-new-privileges` |
| Memory cap | `--memory` + `--memory-swap` (swap disabled) |
| CPU cap | `--cpus` |
| PID cap | `--pids-limit` |
| Read-only filesystem | `--read-only` with `--tmpfs=/tmp` |
| Execution timeout | `setTimeout` + `SIGKILL` on the spawned process |
| Filename validation | Allowlist regex + traversal check |
| File size limits | Per-file and per-workspace byte caps |
| Rate limiting | Per-IP via `express-rate-limit` (stricter on `/run`) |

---

## Frontend Integration Notes

```js
const API = 'http://localhost:3001';

// 1. On app load — create or restore session
const { sessionId, files } = await fetch(`${API}/api/sessions`, { method: 'POST' }).then(r => r.json());
// Store sessionId in localStorage for persistence across reloads

// 2. Load file tree
const { files } = await fetch(`${API}/api/files?sessionId=${sessionId}`).then(r => r.json());

// 3. Open a file
const { content } = await fetch(`${API}/api/files/index.php?sessionId=${sessionId}`).then(r => r.json());

// 4. Ctrl+S — save active file
await fetch(`${API}/api/files/index.php`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, content: editor.getValue() }),
});

// 5. Run button
const result = await fetch(`${API}/api/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, entryFile: 'index.php' }),
}).then(r => r.json());

iframe.srcdoc = result.html;
if (result.stderr) showToast(result.stderr, 'error');
if (result.timedOut) showToast('Execution timed out after 5s', 'warn');
```
