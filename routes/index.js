/**
 * Mounts the application's API route modules onto the provided Express app.
 *
 * Route order matters: more specific paths must be registered before parameterized ones.
 * @param {import('express').Express} app - The Express application instance to mount routes on.
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
  require('./metrics')(app);
  require('./paymentMethods')(app);
}

module.exports = registerRoutes;
