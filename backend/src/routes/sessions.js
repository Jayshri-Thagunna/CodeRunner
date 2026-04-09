import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createSession, listSessionsForUser, renameSession, ensureSessionExists } from '../services/workspace.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * POST /api/sessions
 * Body: { userId, name? }
 * Response: { sessionId, name, files }
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId = '', name = '' } = req.body;
    const sessionId = uuidv4();
    const files = await createSession(sessionId, { userId, name });
    logger.info('Session created', { sessionId, userId });
    res.status(201).json({ sessionId, name: name || 'Untitled project', files });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions?userId=...
 * Response: { sessions: [{ sessionId, name, createdAt }] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) throw new AppError('userId query param is required', 400, 'BAD_REQUEST');
    const sessions = await listSessionsForUser(userId);
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/sessions/:id
 * Body: { name }
 * Response: { sessionId, name }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !name.trim()) throw new AppError('name is required', 400, 'BAD_REQUEST');
    await ensureSessionExists(id);
    await renameSession(id, name.trim());
    res.json({ sessionId: id, name: name.trim() });
  } catch (err) {
    next(err);
  }
});

export default router;
