const createLocationTool = require('./GetLocation');

const makeReq = ({ location, featureEnabled = true } = {}) => ({
  config: { location: { enabled: featureEnabled } },
  user: { id: 'user-1', personalization: location ? { location } : {} },
});

describe('createLocationTool', () => {
  it('returns the user location when enabled', async () => {
    const tool = await createLocationTool({
      userId: 'user-1',
      req: makeReq({
        location: {
          enabled: true,
          source: 'manual',
          manual: 'Berlin, Germany',
          timezone: 'Europe/Berlin',
        },
      }),
    });
    const result = await tool.invoke({});
    expect(result).toContain('Berlin, Germany');
    expect(result).toContain('Europe/Berlin');
  });

  it('returns a not-shared message when the user has not opted in', async () => {
    const tool = await createLocationTool({ userId: 'user-1', req: makeReq({}) });
    const result = await tool.invoke({});
    expect(result).toMatch(/has not shared/i);
  });

  it('returns a disabled message when the admin flag is off', async () => {
    const tool = await createLocationTool({
      userId: 'user-1',
      req: makeReq({ location: { enabled: true, manual: 'X' }, featureEnabled: false }),
    });
    const result = await tool.invoke({});
    expect(result).toMatch(/disabled/i);
  });
});
