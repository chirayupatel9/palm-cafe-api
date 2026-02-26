/**
 * Mount all API route modules on the Express app.
 * Route order matters: more specific paths must be registered before parameterized ones.
 */
function registerRoutes(app) {
  require('./auth')(app);
  require('./superadmin')(app);
  require('./menu')(app);
  require('./cafe')(app);
  require('./inventory')(app);
  require('./orders')(app);
  require('./customers')(app);
  require('./health')(app);
  require('./paymentMethods')(app);
}

module.exports = registerRoutes;
