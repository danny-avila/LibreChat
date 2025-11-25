import { getTransactionsConfig, getBalanceConfig } from './config';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

// Helper function to create a minimal AppConfig for testing
const createTestAppConfig = (overrides: Partial<AppConfig> = {}): AppConfig => {
  const minimalConfig: TCustomConfig = {
    version: '1.0.0',
    cache: true,
    interface: {
      endpointsMenu: true,
    },
    registration: {
      socialLogins: [],
    },
    endpoints: {},
  };

  return {
    config: minimalConfig,
    paths: {
      uploads: '',
      imageOutput: '',
      publicPath: '',
    },
    fileStrategy: FileSources.local,
    fileStrategies: {},
    imageOutputType: 'png',
    ...overrides,
  };
};

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('~/utils', () => ({
  isEnabled: jest.fn((value) => value === 'true'),
}));

describe('getTransactionsConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CHECK_BALANCE;
    delete process.env.START_BALANCE;
  });

  describe('when appConfig is not provided', () => {
    it('should return default config with enabled: true', () => {
      const result = getTransactionsConfig();
      expect(result).toEqual({ enabled: true });
    });
  });

  describe('when appConfig is provided', () => {
    it('should return transactions config when explicitly set to false', () => {
      const appConfig = createTestAppConfig({
        transactions: { enabled: false },
        balance: { enabled: false },
      });
      const result = getTransactionsConfig(appConfig);
      expect(result).toEqual({ enabled: false });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return transactions config when explicitly set to true', () => {
      const appConfig = createTestAppConfig({
        transactions: { enabled: true },
        balance: { enabled: false },
      });
      const result = getTransactionsConfig(appConfig);
      expect(result).toEqual({ enabled: true });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return default config when transactions is not defined', () => {
      const appConfig = createTestAppConfig({
        balance: { enabled: false },
      });
      const result = getTransactionsConfig(appConfig);
      expect(result).toEqual({ enabled: true });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    describe('balance and transactions interaction', () => {
      it('should force transactions to be enabled when balance is enabled but transactions is disabled', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
          balance: { enabled: true },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: true });
        expect(logger.warn).toHaveBeenCalledWith(
          'Configuration warning: transactions.enabled=false is incompatible with balance.enabled=true. ' +
            'Transactions will be enabled to ensure balance tracking works correctly.',
        );
      });

      it('should not override transactions when balance is enabled and transactions is enabled', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: true },
          balance: { enabled: true },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: true });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should allow transactions to be disabled when balance is disabled', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
          balance: { enabled: false },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: false });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should use default when balance is enabled but transactions is not defined', () => {
        const appConfig = createTestAppConfig({
          balance: { enabled: true },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: true });
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('with environment variables for balance', () => {
      it('should force transactions enabled when CHECK_BALANCE env is true and transactions is false', () => {
        process.env.CHECK_BALANCE = 'true';
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: true });
        expect(logger.warn).toHaveBeenCalledWith(
          'Configuration warning: transactions.enabled=false is incompatible with balance.enabled=true. ' +
            'Transactions will be enabled to ensure balance tracking works correctly.',
        );
      });

      it('should allow transactions disabled when CHECK_BALANCE env is false', () => {
        process.env.CHECK_BALANCE = 'false';
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: false });
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle empty appConfig object', () => {
        const appConfig = createTestAppConfig();
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: true });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should handle appConfig with null balance', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          balance: null as any,
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: false });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should handle appConfig with undefined balance', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
          balance: undefined,
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: false });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('should handle appConfig with balance enabled undefined', () => {
        const appConfig = createTestAppConfig({
          transactions: { enabled: false },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          balance: { enabled: undefined as any },
        });
        const result = getTransactionsConfig(appConfig);
        expect(result).toEqual({ enabled: false });
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });
  });
});

describe('getBalanceConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CHECK_BALANCE;
    delete process.env.START_BALANCE;
  });

  describe('when appConfig is not provided', () => {
    it('should return config based on environment variables', () => {
      process.env.CHECK_BALANCE = 'true';
      process.env.START_BALANCE = '1000';
      const result = getBalanceConfig();
      expect(result).toEqual({
        enabled: true,
        startBalance: 1000,
      });
    });

    it('should return empty config when no env vars are set', () => {
      const result = getBalanceConfig();
      expect(result).toEqual({ enabled: false });
    });

    it('should handle CHECK_BALANCE true without START_BALANCE', () => {
      process.env.CHECK_BALANCE = 'true';
      const result = getBalanceConfig();
      expect(result).toEqual({
        enabled: true,
      });
    });

    it('should handle START_BALANCE without CHECK_BALANCE', () => {
      process.env.START_BALANCE = '5000';
      const result = getBalanceConfig();
      expect(result).toEqual({
        enabled: false,
        startBalance: 5000,
      });
    });
  });

  describe('when appConfig is provided', () => {
    it('should merge appConfig balance with env config', () => {
      process.env.CHECK_BALANCE = 'true';
      process.env.START_BALANCE = '1000';
      const appConfig = createTestAppConfig({
        balance: {
          enabled: false,
          startBalance: 2000,
          autoRefillEnabled: true,
        },
      });
      const result = getBalanceConfig(appConfig);
      expect(result).toEqual({
        enabled: false,
        startBalance: 2000,
        autoRefillEnabled: true,
      });
    });

    it('should use env config when appConfig balance is not provided', () => {
      process.env.CHECK_BALANCE = 'true';
      process.env.START_BALANCE = '3000';
      const appConfig = createTestAppConfig();
      const result = getBalanceConfig(appConfig);
      expect(result).toEqual({
        enabled: true,
        startBalance: 3000,
      });
    });

    it('should handle appConfig with null balance', () => {
      process.env.CHECK_BALANCE = 'true';
      const appConfig = createTestAppConfig({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        balance: null as any,
      });
      const result = getBalanceConfig(appConfig);
      expect(result).toEqual({
        enabled: true,
      });
    });
  });
});
