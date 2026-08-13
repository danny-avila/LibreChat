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

  it('awaits the Clerk startup gate after connecting to MongoDB and before the worker listens', () => {
    const connectDbIndex = source.indexOf('await connectDb();');
    const clerkGateIndex = source.indexOf('await ensureClerkStartupReady(clerkAuthConfig');
    const listenIndex = source.indexOf('const server = app.listen');

    expect(connectDbIndex).toBeGreaterThan(-1);
    expect(clerkGateIndex).toBeGreaterThan(-1);
    expect(listenIndex).toBeGreaterThan(-1);
    expect(connectDbIndex).toBeLessThan(clerkGateIndex);
    expect(clerkGateIndex).toBeLessThan(listenIndex);
  });
});
