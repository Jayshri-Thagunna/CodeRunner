import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const handler = (req, res) => {
  res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
};

export const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

export const runLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.runRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
