/**
 * Attach standardized response helper methods to the Express response object.
 *
 * Adds:
 * - res.successData(data, meta): sends JSON `{ data, meta?, requestId? }`.
 * - res.errorResponse(message, code, status): sends JSON `{ error: message, code?, requestId? }` with the given HTTP status (defaults to 400).
 *
 * @param {import('express').Request} req - Express request; may include a `requestId` set by upstream middleware.
 * @param {import('express').Response} res - Express response; helper methods will be attached to this object.
 * @param {import('express').NextFunction} next - Next middleware function.
 */
function responseHelpersMiddleware(req, res, next) {
  res.successData = function (data, meta) {
    const body = { data };
    if (meta && typeof meta === 'object') body.meta = meta;
    if (req.requestId) body.requestId = req.requestId;
    res.json(body);
  };

  res.errorResponse = function (message, code, status) {
    const s = status || 400;
    const body = { error: message };
    if (code) body.code = code;
    if (req.requestId) body.requestId = req.requestId;
    res.status(s).json(body);
  };

  next();
}

module.exports = responseHelpersMiddleware;
