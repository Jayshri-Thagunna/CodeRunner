# PHP CodeRunner

A browser-based PHP editor and runner. Write PHP (and HTML/CSS) in your browser, click **Run**, and see the output instantly — no local PHP install needed.

---

## How it works

The project has two parts: a **frontend** (the editor UI) and a **backend** (the API that runs your code).

### Frontend

A single HTML page (`index.html`) that looks like a code editor (similar to VS Code). It uses the [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the same editor that powers VS Code — loaded from a CDN.

A small static file server (`server.js`) serves the HTML, CSS, and JS files on port **3000**.

What you can do in the UI:
- Create and edit files (`.php`, `.html`, `.css`, `.js`, etc.)
- Open multiple files in tabs
- Search across all files in the sidebar
- Click **Run** to execute PHP and see the output in the preview panel
- HTML/CSS files get a live preview automatically (no Run needed)
- Create and switch between multiple sessions (projects)
- Rename sessions

### Backend

An Express.js API (`backend/src/index.js`) running on port **3001**. It handles three things:

**Sessions** — A session is like a project folder. Each session gets a unique ID (UUID) and lives in its own folder on disk under `/workspaces/<sessionId>/`. New sessions start with two starter files: `index.php` and `functions.php`.

**Files** — The API lets the frontend read, create, and save files inside a session folder. Files are stored as plain text on disk. There are limits: max 512 KB per file, max 5 MB per session, max 50 files per session.

**Running PHP** — When you click Run, the backend spawns a temporary Docker container using the `php:8.2-cli-alpine` image. Your session folder is mounted into the container (read-only), and PHP runs your entry file. The container is:
- Isolated from the network (`--network=none`)
- Limited to 64 MB of memory and 0.5 CPUs
- Killed after 5 seconds if it hasn't finished
- Destroyed immediately after it finishes (`--rm`)

The output (HTML) is sent back to the browser and shown in the preview panel.

### Security

- Filenames are validated with a strict regex — no path traversal (`../`) allowed
- PHP runs in a locked-down Docker container with no network, no new privileges, and a read-only filesystem
- Rate limiting is applied to all API calls (60 req/min general, 10 req/min for Run)

---

## Project structure

```
├── index.html          # The editor UI
├── styles.css          # UI styles
├── app.js              # Frontend logic (editor, sessions, API calls)
├── server.js           # Static file server (port 3000)
├── docker-compose.yml  # Runs frontend + backend together
└── backend/
    ├── src/
    │   ├── index.js            # Express app entry point
    │   ├── config.js           # All config (ports, limits, timeouts)
    │   ├── logger.js           # Logging
    │   ├── routes/
    │   │   ├── sessions.js     # POST/GET/PATCH /api/sessions
    │   │   ├── files.js        # GET/POST/PUT /api/files
    │   │   └── run.js          # POST /api/run
    │   ├── services/
    │   │   ├── workspace.js    # File system operations
    │   │   └── runner.js       # Docker execution logic
    │   └── middleware/
    │       ├── errorHandler.js # Centralized error responses
    │       └── rateLimiter.js  # Rate limiting
    └── tests/
        ├── runner.test.js
        └── filename-validation.test.js
```

---

## Running the project

Make sure you have **Docker** and **Docker Compose** installed.

```bash
docker compose up
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

The backend API is available at [http://localhost:3001](http://localhost:3001).

### Environment variables

You can customize behavior with these variables (set in `.env` or `docker-compose.yml`):

| Variable | Default | Description |
|---|---|---|
| `PHP_IMAGE` | `php:8.2-cli-alpine` | PHP Docker image to use |
| `EXEC_TIMEOUT_MS` | `5000` | Max PHP execution time (ms) |
| `CONTAINER_MEMORY` | `64m` | Memory limit per container |
| `CONTAINER_CPUS` | `0.5` | CPU limit per container |
| `MAX_FILE_SIZE_BYTES` | `524288` | Max size per file (512 KB) |
| `MAX_WORKSPACE_SIZE_BYTES` | `5242880` | Max total session size (5 MB) |
| `RUN_RATE_LIMIT_MAX` | `10` | Max Run requests per minute |

---

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create a new session |
| `GET` | `/api/sessions?userId=` | List sessions for a user |
| `PATCH` | `/api/sessions/:id` | Rename a session |
| `GET` | `/api/files?sessionId=` | List files in a session |
| `GET` | `/api/files/:name?sessionId=` | Read a file |
| `POST` | `/api/files` | Create a new file |
| `PUT` | `/api/files/:name` | Save (overwrite) a file |
| `POST` | `/api/run` | Run PHP and get HTML output |
| `GET` | `/health` | Health check |
