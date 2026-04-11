import { Router } from 'express';
import {
  listFiles,
  readFile,
  writeFile,
} from '../services/workspace.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/files?sessionId=...
 * List all files in a session.
 *
 * Response: { files: [{ name, size, updatedAt }] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) throw new AppError('sessionId query param is required');
    const files = await listFiles(sessionId);
    res.json({ files });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/files/:name?sessionId=...
 * Read a single file.
 *
 * Response: { name, content }
 */
router.get('/:name', async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) throw new AppError('sessionId query param is required');
    const content = await readFile(sessionId, req.params.name);
    res.json({ name: req.params.name, content });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/files
 * Create a new file (rejects duplicates unless overwrite=true).
 *
 * Body: { sessionId, filename, content, overwrite? }
 * Response: { name, size }
 */
router.post('/', async (req, res, next) => {
  try {
    const { sessionId, filename, content = '', overwrite = false } = req.body;
    if (!sessionId) throw new AppError('sessionId is required');
    if (!filename) throw new AppError('filename is required');
    if (typeof content !== 'string') throw new AppError('content must be a string');

    await writeFile(sessionId, filename, content, Boolean(overwrite));
    res.status(201).json({ name: filename, size: Buffer.byteLength(content, 'utf8') });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/files/:name
 * Save (overwrite) an existing file.
 *
 * Body: { sessionId, content }
 * Response: { name, size }
 */
router.put('/:name', async (req, res, next) => {
  try {
    const { sessionId, content } = req.body;
    if (!sessionId) throw new AppError('sessionId is required');
    if (typeof content !== 'string') throw new AppError('content must be a string');

    await writeFile(sessionId, req.params.name, content, true);
    res.json({ name: req.params.name, size: Buffer.byteLength(content, 'utf8') });
  } catch (err) {
    next(err);
  }
});

export default router;
