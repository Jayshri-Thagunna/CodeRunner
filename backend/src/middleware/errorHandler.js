import { logger } from '../logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  logger.error('Unhandled error', { err, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}
