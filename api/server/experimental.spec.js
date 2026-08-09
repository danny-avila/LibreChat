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

  it('runs cross-tenant startup work in the system context', () => {
    expect(source).toContain('await runAsSystem(seedDatabase);');
    expect(source).toMatch(
      /await runAsSystem\(async \(\) => \{\s+await performStartupChecks\(appConfig\);\s+await updateInterfacePerms/,
    );
  });
});
