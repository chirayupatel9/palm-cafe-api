/**
 * Unit tests for validateAuth handleValidationErrors.
 */
jest.mock('express-validator', () => {
  const chain = () => chain;
  chain.trim = () => chain;
  chain.notEmpty = () => chain;
  chain.isLength = () => chain;
  chain.withMessage = () => chain;
  chain.isEmail = () => chain;
  chain.normalizeEmail = () => chain;
  return {
    body: () => chain,
    validationResult: jest.fn()
  };
});

const expressValidator = require('express-validator');
const { handleValidationErrors } = require('../../../middleware/validateAuth');

describe('validateAuth handleValidationErrors', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    expressValidator.validationResult.mockReset();
  });

  it('calls next() when validation result is empty', () => {
    expressValidator.validationResult.mockReturnValue({
      isEmpty: () => true,
      array: () => []
    });
    handleValidationErrors(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with first error when validation has errors', () => {
    expressValidator.validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Email is required' }]
    });
    handleValidationErrors(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Email is required', code: 'VALIDATION_ERROR' })
    );
  });
});
