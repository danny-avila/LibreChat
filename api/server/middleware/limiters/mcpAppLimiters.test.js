const mockCreateMCPAppRateLimiter = jest.fn((kind) => `${kind}-limiter`);
const mockLimiterCache = jest.fn((key) => `${key}-store`);
const mockLogViolation = jest.fn();

jest.mock('@librechat/api', () => ({
  createMCPAppRateLimiter: (...args) => mockCreateMCPAppRateLimiter(...args),
  limiterCache: (...args) => mockLimiterCache(...args),
}));

jest.mock('~/cache/logViolation', () => mockLogViolation);

describe('MCP App limiter wiring', () => {
  const previousScore = process.env.TOOL_CALL_VIOLATION_SCORE;

  beforeAll(() => {
    process.env.TOOL_CALL_VIOLATION_SCORE = '7';
  });

  afterAll(() => {
    if (previousScore === undefined) {
      delete process.env.TOOL_CALL_VIOLATION_SCORE;
    } else {
      process.env.TOOL_CALL_VIOLATION_SCORE = previousScore;
    }
  });

  it.each([
    ['resource', './mcpAppResourceLimiter', 'mcp_app_resource_limiter'],
    ['toolCall', './mcpAppToolCallLimiter', 'mcp_app_tool_call_limiter'],
  ])('wires the %s limiter with its independent store', (kind, modulePath, cacheKey) => {
    expect(require(modulePath)).toBe(`${kind}-limiter`);
    expect(mockLimiterCache).toHaveBeenCalledWith(cacheKey);
    expect(mockCreateMCPAppRateLimiter).toHaveBeenCalledWith(kind, {
      store: `${cacheKey}-store`,
      logViolation: mockLogViolation,
      score: '7',
    });
  });
});
