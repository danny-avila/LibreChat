const {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  getTempChatRetentionDays,
  createTempChatExpirationDate,
} = require('../tempChatRetention');

describe('tempChatRetention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TEMP_CHAT_RETENTION_DAYS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTempChatRetentionDays', () => {
    it('should return default retention days when no config or env var is set', () => {
      const result = getTempChatRetentionDays();
      expect(result).toBe(DEFAULT_RETENTION_DAYS);
    });

    it('should use environment variable when set', () => {
      process.env.TEMP_CHAT_RETENTION_DAYS = '15';
      const result = getTempChatRetentionDays();
      expect(result).toBe(15);
    });

    it('should use config value when set', () => {
      const config = {
        interface: {
          temporaryChatRetentionDays: 7,
        },
      };
      const result = getTempChatRetentionDays(config);
      expect(result).toBe(7);
    });

    it('should prioritize config over environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_DAYS = '15';
      const config = {
        interface: {
          temporaryChatRetentionDays: 7,
        },
      };
      const result = getTempChatRetentionDays(config);
      expect(result).toBe(7);
    });

    it('should enforce minimum retention period', () => {
      const config = {
        interface: {
          temporaryChatRetentionDays: 0,
        },
      };
      const result = getTempChatRetentionDays(config);
      expect(result).toBe(MIN_RETENTION_DAYS);
    });

    it('should enforce maximum retention period', () => {
      const config = {
        interface: {
          temporaryChatRetentionDays: 400,
        },
      };
      const result = getTempChatRetentionDays(config);
      expect(result).toBe(MAX_RETENTION_DAYS);
    });

    it('should handle invalid environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_DAYS = 'invalid';
      const result = getTempChatRetentionDays();
      expect(result).toBe(DEFAULT_RETENTION_DAYS);
    });

    it('should handle invalid config value', () => {
      const config = {
        interface: {
          temporaryChatRetentionDays: 'invalid',
        },
      };
      const result = getTempChatRetentionDays(config);
      expect(result).toBe(DEFAULT_RETENTION_DAYS);
    });
  });

  describe('createTempChatExpirationDate', () => {
    it('should create expiration date with default retention period', () => {
      const now = new Date();
      const result = createTempChatExpirationDate();
      
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + DEFAULT_RETENTION_DAYS);
      
      // Allow for small time differences in test execution
      const timeDiff = Math.abs(result.getTime() - expectedDate.getTime());
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference
    });

    it('should create expiration date with custom retention period', () => {
      const config = {
        interface: {
          temporaryChatRetentionDays: 7,
        },
      };
      
      const now = new Date();
      const result = createTempChatExpirationDate(config);
      
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 7);
      
      // Allow for small time differences in test execution
      const timeDiff = Math.abs(result.getTime() - expectedDate.getTime());
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference
    });

    it('should return a Date object', () => {
      const result = createTempChatExpirationDate();
      expect(result).toBeInstanceOf(Date);
    });

    it('should return a future date', () => {
      const now = new Date();
      const result = createTempChatExpirationDate();
      expect(result.getTime()).toBeGreaterThan(now.getTime());
    });
  });
}); 