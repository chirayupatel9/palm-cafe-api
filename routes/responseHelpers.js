/**
 * Attach standardized response helpers to res. Use after requestId middleware.
 * Success: res.successData(data, meta) -> { data, meta?, requestId? }
 * Error: res.errorResponse(message, code, status) -> { error: message, code?, requestId? }
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
