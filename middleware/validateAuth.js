const { body, validationResult } = require('express-validator');

const registerValidation = [
  body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 100 }).withMessage('Username too long'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

/**
 * Handle express-validator results: continue the request if valid, otherwise send a standardized validation error response.
 *
 * If validation errors exist, the first error message is returned with code `"VALIDATION_ERROR"` and HTTP 400.
 * If `res.errorResponse` is provided, it will be invoked with `(message, 'VALIDATION_ERROR', 400)`.
 *
 * @param {import('express').Request} req - The incoming request to validate.
 * @param {import('express').Response & { errorResponse?: (msg: string, code: string, status: number) => void }} res - The response object; may implement `errorResponse`.
 * @param {import('express').NextFunction} next - The next middleware function to call when validation passes.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const first = errors.array()[0];
  if (res.errorResponse) {
    return res.errorResponse(first.msg, 'VALIDATION_ERROR', 400);
  }
  return res.status(400).json({ error: first.msg, code: 'VALIDATION_ERROR' });
}

module.exports = {
  registerValidation,
  loginValidation,
  handleValidationErrors
};
