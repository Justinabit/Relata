import type { NextFunction, Request, Response } from 'express';

/**
 * FUTURE(auth): Request identity seam.
 *
 * Relata currently has no accounts. Every request is anonymous and nothing is stored per
 * user on the server. All services that will one day need an owner (saved studies,
 * collections, history, notes) should accept a `RequestContext` rather than reading the
 * request directly. To add authentication later, replace `attachContext` with a middleware
 * that verifies a session/JWT and fills `userId`; route handlers and services need no changes.
 */
export interface RequestContext {
  userId: string | null;
  anonymous: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx: RequestContext;
  }
}

export function attachContext(req: Request, _res: Response, next: NextFunction): void {
  req.ctx = { userId: null, anonymous: true };
  next();
}
