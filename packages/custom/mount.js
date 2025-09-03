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

  // /**
  //  * Reloads server configuration and caches without exiting the process.
  //  */
  // app.post('/api/reload', requireJwtAuth, checkAdmin, async (req, res) => {
  //   try {
  //     const { CacheKeys } = require('librechat-data-provider');
  //     const { getLogStores } = require(path.resolve(__dirname, '..', '..', 'api', 'cache'));
  //     const { getAppConfig, clearAppConfigCache } = require(
  //       path.resolve(__dirname, '..', '..', 'api', 'server', 'services', 'Config')
  //     );
  //     const initializeMCPs = require(
  //       path.resolve(__dirname, '..', '..', 'api', 'server', 'services', 'initializeMCPs')
  //     );
  //     const { updateInterfacePermissions } = require(
  //       path.resolve(__dirname, '..', '..', 'api', 'server', 'models', 'interface')
  //     );

  //     const configCache = getLogStores(CacheKeys.CONFIG_STORE);
  //     const staticCache = getLogStores(CacheKeys.STATIC_CONFIG);

  //     const keysToDelete = [
  //       CacheKeys.APP_CONFIG,
  //       CacheKeys.STARTUP_CONFIG,
  //       CacheKeys.MODELS_CONFIG,
  //       CacheKeys.ENDPOINT_CONFIG,
  //       CacheKeys.TOOLS,
  //       CacheKeys.PLUGINS,
  //       CacheKeys.CUSTOM_CONFIG,
  //     ];
  //     for (const key of keysToDelete) {
  //       await configCache.delete(key);
  //     }
  //     if (staticCache) {
  //       await staticCache.delete(CacheKeys.LIBRECHAT_YAML_CONFIG);
  //     }

  //     await clearAppConfigCache();
  //     const appConfig = await getAppConfig({ refresh: true });
  //     await updateInterfacePermissions(appConfig);
  //     await initializeMCPs();

  //     res.status(200).json({ message: 'Configuration reloaded successfully.' });
  //   } catch (error) {
  //     console.error('[Custom] Reload failed:', error);
  //     res.status(500).json({ error: 'Reload failed', details: error?.message });
  //   }
  // });
  // console.info('[Custom] Reload endpoint mounted at /api/reload');

  app.post('/api/restart', requireJwtAuth, checkAdmin, (req, res) => {
    res.status(200).json({ message: 'Restarting server...' });
    // Allow response to flush before exiting.
    setTimeout(() => process.exit(0), 100);
  });
  console.info('[Custom] Restart endpoint mounted at /api/restart');
}; 