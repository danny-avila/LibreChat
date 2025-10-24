const { ToolCacheKeys } = require('../getCachedTools');

describe('getCachedTools - Cache Isolation Security', () => {
  describe('ToolCacheKeys.MCP_SERVER', () => {
    it('should generate cache keys that include userId', () => {
      const key = ToolCacheKeys.MCP_SERVER('user123', 'github');
      expect(key).toBe('tools:mcp:user123:github');
    });
  });
});
