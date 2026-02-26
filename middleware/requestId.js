const { v4: uuidv4 } = require('uuid');

/**
 * Attach or reuse X-Request-ID for tracing. If client sends X-Request-ID, use it; otherwise generate one.
 * Sets req.requestId and res.setHeader('X-Request-ID', requestId).
 */
function requestIdMiddleware(req, res, next) {
  const clientId = req.get('X-Request-ID');
  req.requestId = clientId && String(clientId).trim() ? String(clientId).trim() : uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestIdMiddleware;
