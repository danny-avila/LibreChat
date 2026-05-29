import type { AppConfig } from '~/types';
import {
  createFileExpirationDate,
  createTempChatExpirationDate,
  getFileRetentionHours,
  getTempChatRetentionHours,
  DEFAULT_RETENTION_HOURS,
  MIN_RETENTION_HOURS,
  MAX_RETENTION_HOURS,
} from './tempChatRetention';

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
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 12,
        },
      };
      const result = getTempChatRetentionHours(config?.interfaceConfig);
      expect(result).toBe(12);
    });

    it('should prioritize config over environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_HOURS = '48';
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 12,
        },
      };
      const result = getTempChatRetentionHours(config?.interfaceConfig);
      expect(result).toBe(12);
    });

    it('should enforce minimum retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 0,
        },
      };
      const result = getTempChatRetentionHours(config?.interfaceConfig);
      expect(result).toBe(MIN_RETENTION_HOURS);
    });

    it('should enforce maximum retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 10000,
        },
      };
      const result = getTempChatRetentionHours(config?.interfaceConfig);
      expect(result).toBe(MAX_RETENTION_HOURS);
    });

    it('should handle invalid environment variable', () => {
      process.env.TEMP_CHAT_RETENTION_HOURS = 'invalid';
      const result = getTempChatRetentionHours();
      expect(result).toBe(DEFAULT_RETENTION_HOURS);
    });

    it('should handle invalid config value', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 'invalid' as unknown as number,
        },
      };
      const result = getTempChatRetentionHours(config?.interfaceConfig);
      expect(result).toBe(DEFAULT_RETENTION_HOURS);
    });
  });

  describe('getFileRetentionHours', () => {
    it('should return null when file retention is not configured', () => {
      expect(getFileRetentionHours()).toBeNull();
    });

    it('should return the configured file retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          fileRetention: 720,
        },
      };

      expect(getFileRetentionHours(config.interfaceConfig)).toBe(720);
    });

    it('should enforce minimum file retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          fileRetention: 0,
        },
      };

      expect(getFileRetentionHours(config.interfaceConfig)).toBe(MIN_RETENTION_HOURS);
    });

    it('should enforce maximum file retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          fileRetention: 10000,
        },
      };

      expect(getFileRetentionHours(config.interfaceConfig)).toBe(MAX_RETENTION_HOURS);
    });
  });

  describe('createTempChatExpirationDate', () => {
    it('should create expiration date with default retention period', () => {
      const beforeCall = Date.now();
      const result = createTempChatExpirationDate();
      const afterCall = Date.now();

      const expectedMin = beforeCall + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;
      const expectedMax = afterCall + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;

      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should create expiration date with custom retention period', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 12,
        },
      };

      const beforeCall = Date.now();
      const result = createTempChatExpirationDate(config?.interfaceConfig);
      const afterCall = Date.now();

      const expectedMin = beforeCall + 12 * 60 * 60 * 1000;
      const expectedMax = afterCall + 12 * 60 * 60 * 1000;

      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
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

  describe('createFileExpirationDate', () => {
    it('should use file retention when configured', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          fileRetention: 24,
          temporaryChatRetention: 12,
        },
      };

      const beforeCall = Date.now();
      const result = createFileExpirationDate(config.interfaceConfig);
      const afterCall = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(beforeCall + 24 * 60 * 60 * 1000);
      expect(result.getTime()).toBeLessThanOrEqual(afterCall + 24 * 60 * 60 * 1000);
    });

    it('should fall back to temporary chat retention when file retention is not configured', () => {
      const config: Partial<AppConfig> = {
        interfaceConfig: {
          temporaryChatRetention: 12,
        },
      };

      const beforeCall = Date.now();
      const result = createFileExpirationDate(config.interfaceConfig);
      const afterCall = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(beforeCall + 12 * 60 * 60 * 1000);
      expect(result.getTime()).toBeLessThanOrEqual(afterCall + 12 * 60 * 60 * 1000);
    });
  });
});
