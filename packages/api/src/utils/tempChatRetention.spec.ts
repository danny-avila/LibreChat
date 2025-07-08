import {
  MIN_RETENTION_HOURS,
  MAX_RETENTION_HOURS,
  DEFAULT_RETENTION_HOURS,
  getTempChatRetentionHours,
  createTempChatExpirationDate,
} from './tempChatRetention';
import type { TCustomConfig } from 'librechat-data-provider';

describe('tempChatRetention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.TEMP_CHAT_RETENTION_HOURS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTempChatRetentionHours', () => {
    it('should return default retention hours when no config or env var is set', () => {
      const result = getTempChatRetentionHours();
      expect(result).toBe(DEFAULT_RETENTION_HOURS);
    });

    it('should use environment variable when set', () => {
      process.env.TEMP_CHAT_RETENTION_HOURS = '48';
      const result = getTempChatRetentionHours();
      expect(result).toBe(48);
    });

    it('should use config value when set', () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 12,
        },
      };
      const result = getTempChatRetentionHours(config);
      expect(result).toBe(12);
    });

    it('should prioritize config over environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_HOURS = '48';
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 12,
        },
      };
      const result = getTempChatRetentionHours(config);
      expect(result).toBe(12);
    });

    it('should enforce minimum retention period', () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 0,
        },
      };
      const result = getTempChatRetentionHours(config);
      expect(result).toBe(MIN_RETENTION_HOURS);
    });

    it('should enforce maximum retention period', () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 10000,
        },
      };
      const result = getTempChatRetentionHours(config);
      expect(result).toBe(MAX_RETENTION_HOURS);
    });

    it('should handle invalid environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_HOURS = 'invalid';
      const result = getTempChatRetentionHours();
      expect(result).toBe(DEFAULT_RETENTION_HOURS);
    });

    it('should handle invalid config value', () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 'invalid' as unknown as number,
        },
      };
      const result = getTempChatRetentionHours(config);
      expect(result).toBe(DEFAULT_RETENTION_HOURS);
    });
  });

  describe('createTempChatExpirationDate', () => {
    it('should create expiration date with default retention period', () => {
      const result = createTempChatExpirationDate();

      const expectedDate = new Date();
      expectedDate.setHours(expectedDate.getHours() + DEFAULT_RETENTION_HOURS);

      // Allow for small time differences in test execution
      const timeDiff = Math.abs(result.getTime() - expectedDate.getTime());
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference
    });

    it('should create expiration date with custom retention period', () => {
      const config: Partial<TCustomConfig> = {
        interface: {
          temporaryChatRetention: 12,
        },
      };

      const result = createTempChatExpirationDate(config);

      const expectedDate = new Date();
      expectedDate.setHours(expectedDate.getHours() + 12);

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
