const fs = require('fs');
const path = require('path');

describe('Experimental server configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, 'experimental.js'), 'utf8');

  it('configures HTTP timeouts for each cluster worker server', () => {
    const listenIndex = source.indexOf('const server = app.listen');
    const timeoutConfigIndex = source.indexOf('configureServerTimeouts(server);');

    expect(listenIndex).toBeGreaterThan(-1);
    expect(timeoutConfigIndex).toBeGreaterThan(-1);
    expect(listenIndex).toBeLessThan(timeoutConfigIndex);
  });

  it('lets each worker drain registered services before cluster shutdown', () => {
    const listenIndex = source.indexOf('const server = app.listen');
    const gracefulShutdownIndex = source.indexOf('setupGracefulShutdown(server);');

    expect(gracefulShutdownIndex).toBeGreaterThan(-1);
    expect(listenIndex).toBeLessThan(gracefulShutdownIndex);
    expect(source).toContain('if (shuttingDown) {');
    expect(source).toMatch(/if \(shuttingDown\) \{[\s\S]*?return;[\s\S]*?Starting a new worker/);
  });

  it('starts approval expiry after installing the scheduled-run callback', () => {
    const handlerIndex = source.indexOf(
      'GenerationJobManager.setApprovalExpiredHandler(recordExpiredScheduleApproval);',
    );
    const initializeIndex = source.indexOf('GenerationJobManager.initialize();');

    expect(handlerIndex).toBeGreaterThan(-1);
    expect(initializeIndex).toBeGreaterThan(handlerIndex);
  });

  it('runs cross-tenant startup work in the system context', () => {
    expect(source).toContain('await runAsSystem(seedDatabase);');
    expect(source).toMatch(
      /await runAsSystem\(async \(\) => \{\s+await performStartupChecks\(appConfig\);\s+await updateInterfacePerms/,
    );
  });

  it('matches the standard server pre-authentication tenant routes', () => {
    expect(source).toContain("app.use('/oauth', preAuthTenantMiddleware, routes.oauth);");
    expect(source).toContain("app.use('/api/auth', preAuthTenantMiddleware, routes.auth);");
    expect(source).toContain(
      "app.use('/api/config', preAuthTenantMiddleware, optionalJwtAuth, routes.config);",
    );
    expect(source).toContain("app.use('/api/share', preAuthTenantMiddleware, routes.share);");
  });
});
