/**
 * Custom Extensions Mount Point
 * Handles mounting of all custom modules for GovGPT
 */

const path = require('path');

module.exports = (app) => {
  const requireJwtAuth = require(
    path.join(__dirname, '..', '..', 'api', 'server', 'middleware', 'requireJwtAuth')
  );

  if (!requireJwtAuth) {
    throw new Error('requireJwtAuth middleware not found in expected locations');
  }

  const modules = [
    {
      name: 'Admin',
      // Point directly to the compiled router factory
      path: path.resolve(__dirname, '..', 'librechat-admin', 'dist', 'router'),
      route: '/admin',
    },
    // Future modules can be added here:
    // {
    //   name: 'Analytics',
    //   path: path.resolve(__dirname, '..', 'analytics', 'dist', 'router'),
    //   route: '/analytics',
    // },
  ];

  modules.forEach(({ name, path: modulePath, route }) => {
    try {
      const mod = require(modulePath);

      let router;
      if (typeof mod === 'function') {
        // Legacy default export (back-compat)
        router = mod(requireJwtAuth);
      } else if (mod?.buildAdminRouter) {
        router = mod.buildAdminRouter(requireJwtAuth);
      } else {
        throw new Error('Expected router factory not found');
      }

      app.use(route, router);
      console.info(`[${name}] routes mounted at ${route}`);
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') {
        console.error(`[${name}] Mount error:`, e);
      } else {
        console.warn(`[${name}] Module not found at ${modulePath}`);
      }
    }
  });

  /*
   * Admin-only endpoint to restart the backend.
   * Sends 200 first, then exits the process so Docker will auto-restart the container.
   */
  const adminMiddlewarePath = path.join(
    __dirname,
    '..',
    '..',
    'api',
    'server',
    'middleware',
    'roles',
    'admin',
  );
  const checkAdmin = require(adminMiddlewarePath);

  app.post('/api/restart', requireJwtAuth, checkAdmin, (req, res) => {
    res.status(200).json({ message: 'Restarting server...' });
    // Allow response to flush before exiting.
    setTimeout(() => process.exit(0), 100);
  });
  console.info('[Custom] Restart endpoint mounted at /api/restart');
}; 