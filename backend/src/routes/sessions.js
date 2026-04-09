import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createSession } from '../services/workspace.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * POST /api/sessions
 * Create a new session with starter files.
 *
 * Response: { sessionId, files: [{ name, size }] }
 */
router.post('/', async (req, res, next) => {
  try {
    const sessionId = uuidv4();
    const files = await createSession(sessionId);
    logger.info('Session created via API', { sessionId });
    res.status(201).json({ sessionId, files });
  } catch (err) {
    next(err);
  }
});

export default router;
