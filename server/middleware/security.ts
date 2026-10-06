import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

/** `.env` files often drop the quotes around CSP keywords (FRAME_ANCESTORS=self), which browsers treat as a hostname. */
const frameAncestors = (process.env.FRAME_ANCESTORS?.trim() || "'self'")
  .split(/\s+/)
  .map((v) => (['self', 'none'].includes(v.toLowerCase()) ? `'${v.toLowerCase()}'` : v));

export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      // React sets a few inline style attributes; scripts remain locked to same-origin files.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': frameAncestors,
    },
  },
  frameguard: false, // superseded by CSP frame-ancestors above
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});

function limiter(limit: number, label: string): RequestHandler {
  return rateLimit({
    windowMs: config.rate.windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      const retry = Math.ceil(config.rate.windowMs / 1000);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: `Too many ${label} requests. Please wait a moment and try again.`, retryAfterSeconds: retry } });
    },
  });
}

export const generalLimiter = limiter(config.rate.general, '');
export const searchLimiter = limiter(config.rate.search, 'search');
export const aiLimiter = limiter(config.rate.ai, 'AI analysis');
export const uploadLimiter = limiter(config.rate.upload, 'upload');

/** Aborts downstream work when the browser disconnects or cancels the request. */
export function requestSignal(req: Request, res: Response): AbortSignal {
  const ctrl = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ctrl.abort();
  });
  req.on('aborted', () => ctrl.abort());
  return ctrl.signal;
}

/** Access log without query strings or bodies: research text and documents are never logged. */
export const accessLog: RequestHandler = (req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`);
  });
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next: NextFunction) => {
  if (res.headersSent) return;
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: `Invalid request${first ? `: ${first.path.join('.') || 'body'}: ${first.message}` : '.'}` } });
    return;
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: `This file is larger than the ${Math.round(config.limits.maxUploadBytes / 1048576)} MB limit.` } });
      return;
    }
    res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: 'The upload could not be processed. Send a single file in the "file" field.' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The text you sent is too large.' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }
  console.error('[error]', err instanceof Error ? err.message : 'unknown error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' } });
};
