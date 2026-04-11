import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const ALLOWED_FILENAME_RE = /^[a-zA-Z0-9_\-. ]+\.[a-zA-Z0-9]+$/;

export function validateFilename(name) {
  if (!name || typeof name !== 'string') throw new AppError('Filename is required');
  if (name.length > 128) throw new AppError('Filename too long');
  if (!ALLOWED_FILENAME_RE.test(name)) {
    throw new AppError(
      'Invalid filename. Use alphanumeric characters, dashes, underscores, spaces, and a valid extension.',
      400,
      'INVALID_FILENAME'
    );
  }
  // Belt-and-suspenders: block traversal even if regex passes
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new AppError('Path traversal detected', 400, 'PATH_TRAVERSAL');
  }
}

export function sessionDir(sessionId) {
  if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) {
    throw new AppError('Invalid sessionId', 400, 'INVALID_SESSION');
  }
  return path.join(config.workspaceRoot, sessionId);
}

export async function ensureSessionExists(sessionId) {
  const dir = sessionDir(sessionId);
  try {
    await fs.access(dir);
  } catch {
    throw new AppError('Session not found', 404, 'SESSION_NOT_FOUND');
  }
  return dir;
}

export async function safeFilePath(sessionId, filename) {
  validateFilename(filename);
  const dir = await ensureSessionExists(sessionId);
  const resolved = path.resolve(dir, filename);
  // Ensure resolved path is strictly inside the session dir
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    throw new AppError('Path traversal detected', 400, 'PATH_TRAVERSAL');
  }
  return resolved;
}

export async function getWorkspaceSize(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const stat = await fs.stat(path.join(dir, entry.name));
      total += stat.size;
    }
  }
  return total;
}

const STARTER_FILES = {
  'index.php': `<?php
// Welcome to Browser IDE
echo "<h1>Hello from PHP " . PHP_VERSION . "!</h1>";
echo "<p>Edit this file and click <strong>Run</strong> to see your output.</p>";
?>`,
  'functions.php': `<?php
// Helper functions

function greet(string $name): string {
    return "Hello, " . htmlspecialchars($name) . "!";
}
?>`,
};

export async function createSession(sessionId, { userId = '', name = '' } = {}) {
  const dir = path.join(config.workspaceRoot, sessionId);
  await fs.mkdir(dir, { recursive: true });

  // Persist metadata so we can list sessions per user
  await fs.writeFile(
    path.join(dir, '.meta.json'),
    JSON.stringify({ userId, name: name || 'Untitled project', createdAt: new Date().toISOString() }),
    'utf8'
  );

  logger.info('Session created', { sessionId, userId });

  const files = [];
  for (const [name, content] of Object.entries(STARTER_FILES)) {
    await fs.writeFile(path.join(dir, name), content, 'utf8');
    files.push({ name, size: Buffer.byteLength(content, 'utf8') });
  }
  return files;
}

export async function listFiles(sessionId) {
  const dir = await ensureSessionExists(sessionId);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name === '.meta.json') continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    files.push({ name: entry.name, size: stat.size, updatedAt: stat.mtime.toISOString() });
  }
  return files;
}

export async function listSessionsForUser(userId) {
  let entries;
  try {
    entries = await fs.readdir(config.workspaceRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(config.workspaceRoot, entry.name, '.meta.json');
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      if (meta.userId === userId) {
        sessions.push({ sessionId: entry.name, name: meta.name, createdAt: meta.createdAt });
      }
    } catch {
    }
  }
  return sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function renameSession(sessionId, name) {
  const dir = await ensureSessionExists(sessionId);
  const metaPath = path.join(dir, '.meta.json');
  let meta = {};
  try { meta = JSON.parse(await fs.readFile(metaPath, 'utf8')); } catch {}
  meta.name = name;
  await fs.writeFile(metaPath, JSON.stringify(meta), 'utf8');
}

export async function readFile(sessionId, filename) {
  const filePath = await safeFilePath(sessionId, filename);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    throw err;
  }
}

export async function writeFile(sessionId, filename, content, overwrite = false) {
  validateFilename(filename);
  const dir = await ensureSessionExists(sessionId);
  const filePath = path.resolve(dir, filename);

  if (!filePath.startsWith(path.resolve(dir) + path.sep)) {
    throw new AppError('Path traversal detected', 400, 'PATH_TRAVERSAL');
  }

  const contentBytes = Buffer.byteLength(content, 'utf8');
  if (contentBytes > config.maxFileSizeBytes) {
    throw new AppError(
      `File exceeds max size of ${config.maxFileSizeBytes} bytes`,
      413,
      'FILE_TOO_LARGE'
    );
  }

  // Check for existing file
  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {}

  if (exists && !overwrite) {
    throw new AppError('File already exists. Set overwrite=true to replace it.', 409, 'FILE_EXISTS');
  }

  // Check total workspace size
  const currentSize = await getWorkspaceSize(dir);
  const existingFileSize = exists
    ? (await fs.stat(filePath)).size
    : 0;
  if (currentSize - existingFileSize + contentBytes > config.maxWorkspaceSizeBytes) {
    throw new AppError('Workspace size limit exceeded', 413, 'WORKSPACE_TOO_LARGE');
  }

  if (!exists) {
    const files = await fs.readdir(dir);
    if (files.length >= config.maxFilesPerSession) {
      throw new AppError('Max file count reached for this session', 400, 'TOO_MANY_FILES');
    }
  }

  await fs.writeFile(filePath, content, 'utf8');
  logger.info('File written', { sessionId, filename, bytes: contentBytes });
}
