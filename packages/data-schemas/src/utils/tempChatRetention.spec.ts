import type { AppConfig } from '~/types';
import {
  createTempChatExpirationDate,
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

  describe('createTempChatExpirationDate', () => {
    // NJ: Skip because we're purposefully manipulating the expiration date
    it.skip('should create expiration date with default retention period', () => {
      const beforeCall = Date.now();
      const result = createTempChatExpirationDate();
      const afterCall = Date.now();

      const expectedMin = beforeCall + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;
      const expectedMax = afterCall + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000;

      // Result should be between expectedMin and expectedMax
      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    // NJ: Skip because we're purposefully manipulating the expiration date
    it.skip('should create expiration date with custom retention period', () => {
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

      // Result should be between expectedMin and expectedMax
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

  describe('NJ createTempChatExpirationDate', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create expiration date for next midnight (in New Jersey)', () => {
      // Not during DST
      jest.setSystemTime(new Date(Date.UTC(2025, 0, 1, 7)));
      const standardTimeExpirationDate = createTempChatExpirationDate();
      expect(standardTimeExpirationDate.getTime()).toEqual(Date.UTC(2025, 0, 2, 5));

      // Between months
      jest.setSystemTime(new Date(Date.UTC(2025, 0, 31, 7)));
      const monthCrossoverExpirationDate = createTempChatExpirationDate();
      expect(monthCrossoverExpirationDate.getTime()).toEqual(Date.UTC(2025, 1, 1, 5));

      // Between years
      jest.setSystemTime(new Date(Date.UTC(2025, 11, 31, 9)));
      const yearCrossoverExpirationDate = createTempChatExpirationDate();
      expect(yearCrossoverExpirationDate.getTime()).toEqual(Date.UTC(2026, 0, 1, 5));

      // During DST
      jest.setSystemTime(new Date(Date.UTC(2025, 5, 1, 8)));
      const dstExpirationDate = createTempChatExpirationDate();
      expect(dstExpirationDate.getTime()).toEqual(Date.UTC(2025, 5, 2, 4));

      // On the switch to DST
      jest.setSystemTime(new Date(Date.UTC(2025, 2, 9, 6)));
      const dstSwitchExpirationDate = createTempChatExpirationDate();
      expect(dstSwitchExpirationDate.getTime()).toEqual(Date.UTC(2025, 2, 10, 4));

      // On the switch off DST
      jest.setSystemTime(new Date(Date.UTC(2025, 10, 2, 7, 30)));
      const dstSwitchOffExpirationDate = createTempChatExpirationDate();
      expect(dstSwitchOffExpirationDate.getTime()).toEqual(Date.UTC(2025, 10, 3, 5));
    });
  });
});
