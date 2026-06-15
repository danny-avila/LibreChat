const GetLocation = require('./GetLocation');

const makeReq = ({ location, featureEnabled = true } = {}) => ({
  config: { location: { enabled: featureEnabled } },
  user: { id: 'user-1', personalization: location ? { location } : {} },
});

describe('GetLocation tool', () => {
  it('returns the user location when enabled', async () => {
    const tool = new GetLocation({
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
    const tool = new GetLocation({ req: makeReq({}) });
    const result = await tool.invoke({});
    expect(result).toMatch(/has not shared/i);
  });

  it('returns a disabled message when the admin flag is off', async () => {
    const tool = new GetLocation({
      req: makeReq({ location: { enabled: true, manual: 'X' }, featureEnabled: false }),
    });
    const result = await tool.invoke({});
    expect(result).toMatch(/disabled/i);
  });

  it('can be constructed without request context (override) for tool discovery', () => {
    const tool = new GetLocation({ override: true });
    expect(tool.name).toBe('get_location');
    expect(tool.schema).toBeDefined();
  });
});
