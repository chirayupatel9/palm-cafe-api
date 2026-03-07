import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attach or reuse X-Request-ID for tracing.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.get('X-Request-ID');
  req.requestId = clientId && String(clientId).trim() ? String(clientId).trim() : uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}
