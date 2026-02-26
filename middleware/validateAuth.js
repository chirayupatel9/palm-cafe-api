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
