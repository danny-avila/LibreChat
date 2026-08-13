/**
 * Keep the normal and clustered servers on one tested auth-router mount.
 * The middleware must run before every auth route so tenant scope is fixed at
 * the HTTP boundary rather than recovered later from ambient state.
 */
function mountAuthRoute(app, routes, preAuthTenantMiddleware) {
  app.use('/api/auth', preAuthTenantMiddleware, routes.auth);
}

module.exports = mountAuthRoute;
