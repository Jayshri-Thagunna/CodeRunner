import { Router } from 'express';
import { runPhp } from '../services/runner.js';
import { AppError } from '../middleware/errorHandler.js';
import { runLimiter } from '../middleware/rateLimiter.js';

const router = Router();

/**
 * POST /api/run
 * Execute a PHP file in an isolated Docker container.
 *
 * Body: { sessionId, entryFile? }
 * Response: { html, stderr, exitCode, durationMs, timedOut }
 */
router.post('/', runLimiter, async (req, res, next) => {
  try {
    const { sessionId, entryFile = 'index.php' } = req.body;
    if (!sessionId) throw new AppError('sessionId is required');
    if (typeof entryFile !== 'string') throw new AppError('entryFile must be a string');

    const result = await runPhp(sessionId, entryFile);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
