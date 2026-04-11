import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import sessionsRouter from './routes/sessions.js';
import filesRouter from './routes/files.js';
import runRouter from './routes/run.js';

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

app.use('/api/sessions', sessionsRouter);
app.use('/api/files', filesRouter);
app.use('/api/run', runRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  await fs.mkdir(config.workspaceRoot, { recursive: true });
  app.listen(config.port, () => {
    logger.info(`Browser IDE backend listening on port ${config.port}`, {
      workspaceRoot: config.workspaceRoot,
      phpImage: config.phpImage,
    });
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
