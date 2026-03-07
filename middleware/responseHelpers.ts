import { Request, Response, NextFunction } from 'express';

/**
 * Attach standardized response helpers to res.
 */
export function responseHelpersMiddleware(req: Request, res: Response, next: NextFunction): void {
  (res as Response & { successData: (data: unknown, meta?: Record<string, unknown>) => void }).successData = function (data, meta) {
    const body: Record<string, unknown> = { data };
    if (meta && typeof meta === 'object') body.meta = meta;
    if (req.requestId) body.requestId = req.requestId;
    res.json(body);
  };
  (res as Response & { errorResponse: (message: string, code?: string, status?: number) => void }).errorResponse = function (message, code, status) {
    const s = status || 400;
    const body: Record<string, unknown> = { error: message };
    if (code) body.code = code;
    if (req.requestId) body.requestId = req.requestId;
    res.status(s).json(body);
  };
  next();
}
