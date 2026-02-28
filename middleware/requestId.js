const { v4: uuidv4 } = require('uuid');

/**
 * Ensure each request has an X-Request-ID by reusing the incoming header when present or generating a UUID; set req.requestId and the response `X-Request-ID` header.
 */
function requestIdMiddleware(req, res, next) {
  const clientId = req.get('X-Request-ID');
  req.requestId = clientId && String(clientId).trim() ? String(clientId).trim() : uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

module.exports = requestIdMiddleware;
