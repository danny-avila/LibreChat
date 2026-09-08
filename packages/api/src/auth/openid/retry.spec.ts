import { logger } from '@librechat/data-schemas';
import { registerOpenIdWithRetry } from './retry';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

describe('registerOpenIdWithRetry', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('registers after discovery recovers in the background', async () => {
    jest.useFakeTimers();
    const register = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await registerOpenIdWithRetry({ register, startupAttempts: 1, retryDelayMs: 1000 });
    expect(register).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('allows startup retries to be disabled', async () => {
    jest.useFakeTimers();
    const register = jest.fn().mockResolvedValue(true);

    await registerOpenIdWithRetry({ register, startupAttempts: 0, retryDelayMs: 1000 });
    expect(register).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('continues background retries when registration throws', async () => {
    jest.useFakeTimers();
    const register = jest
      .fn()
      .mockRejectedValueOnce(new Error('strategy registration failed'))
      .mockResolvedValueOnce(true);

    await registerOpenIdWithRetry({ register, startupAttempts: 1, retryDelayMs: 1000 });
    expect(logger.error).toHaveBeenCalledWith(
      'OpenID Connect strategy registration failed.',
      expect.any(Error),
    );

    await jest.advanceTimersByTimeAsync(1000);
    expect(register).toHaveBeenCalledTimes(2);
  });
});
