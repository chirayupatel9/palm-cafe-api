import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const registerValidation = [
  body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 100 }).withMessage('Username too long'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

export const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    next();
    return;
  }
  const first = errors.array()[0];
  const msg = first && typeof first === 'object' && 'msg' in first ? String(first.msg) : 'Validation failed';
  if (res.errorResponse) {
    res.errorResponse(msg, 'VALIDATION_ERROR', 400);
    return;
  }
  res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
}
