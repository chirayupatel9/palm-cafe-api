/**
 * Unit tests for responseHelpers middleware.
 */
const responseHelpersMiddleware = require('../../../routes/responseHelpers');

describe('responseHelpers middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { requestId: 'req-123' };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  it('attaches successData and errorResponse to res', () => {
    responseHelpersMiddleware(req, res, next);
    expect(res.successData).toBeDefined();
    expect(typeof res.successData).toBe('function');
    expect(res.errorResponse).toBeDefined();
    expect(typeof res.errorResponse).toBe('function');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('successData sends body with data and requestId', () => {
    responseHelpersMiddleware(req, res, next);
    res.successData({ id: 1 });
    expect(res.json).toHaveBeenCalledWith({
      data: { id: 1 },
      requestId: 'req-123'
    });
  });

  it('successData includes meta when provided', () => {
    responseHelpersMiddleware(req, res, next);
    res.successData({ list: [] }, { total: 10 });
    expect(res.json).toHaveBeenCalledWith({
      data: { list: [] },
      meta: { total: 10 },
      requestId: 'req-123'
    });
  });

  it('successData omits meta when not object', () => {
    responseHelpersMiddleware(req, res, next);
    res.successData({ x: 1 }, null);
    expect(res.json).toHaveBeenCalledWith({
      data: { x: 1 },
      requestId: 'req-123'
    });
  });

  it('successData omits requestId when req.requestId missing', () => {
    req.requestId = null;
    responseHelpersMiddleware(req, res, next);
    res.successData({ a: 1 });
    expect(res.json).toHaveBeenCalledWith({ data: { a: 1 } });
  });

  it('errorResponse sends status and body with error message', () => {
    responseHelpersMiddleware(req, res, next);
    res.errorResponse('Bad request');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Bad request',
      requestId: 'req-123'
    });
  });

  it('errorResponse uses custom status when provided', () => {
    responseHelpersMiddleware(req, res, next);
    res.errorResponse('Not found', 'NOT_FOUND', 404);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Not found',
      code: 'NOT_FOUND',
      requestId: 'req-123'
    });
  });

  it('errorResponse omits code when not provided', () => {
    responseHelpersMiddleware(req, res, next);
    res.errorResponse('Server error', null, 500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Server error',
      requestId: 'req-123'
    });
  });

  it('errorResponse omits requestId when req.requestId missing', () => {
    req.requestId = undefined;
    responseHelpersMiddleware(req, res, next);
    res.errorResponse('Err');
    expect(res.json).toHaveBeenCalledWith({ error: 'Err' });
  });
});
