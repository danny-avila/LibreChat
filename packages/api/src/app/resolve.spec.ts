import type { AsyncLocalStorage } from 'async_hooks';

jest.mock('@librechat/data-schemas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage: ALS } = require('async_hooks');
  return { tenantStorage: new ALS() };
});

import { resolveAppConfigForUser } from './resolve';

const { tenantStorage } = jest.requireMock('@librechat/data-schemas') as {
  tenantStorage: AsyncLocalStorage<{ tenantId?: string }>;
};

describe('resolveAppConfigForUser', () => {
  const mockGetAppConfig = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppConfig.mockResolvedValue({ registration: {} });
  });

  it('calls getAppConfig with baseOnly when user is null', async () => {
    await resolveAppConfigForUser(mockGetAppConfig, null);
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('calls getAppConfig with baseOnly when user is undefined', async () => {
    await resolveAppConfigForUser(mockGetAppConfig, undefined);
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('calls getAppConfig with baseOnly when user has no tenantId', async () => {
    await resolveAppConfigForUser(mockGetAppConfig, { role: 'USER' });
    expect(mockGetAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });

  it('calls getAppConfig with role and tenantId when user has tenantId', async () => {
    await resolveAppConfigForUser(mockGetAppConfig, { tenantId: 'tenant-a', role: 'USER' });
    expect(mockGetAppConfig).toHaveBeenCalledWith({ role: 'USER', tenantId: 'tenant-a' });
  });

  it('calls tenantStorage.run for tenant users but not for non-tenant users', async () => {
    const runSpy = jest.spyOn(tenantStorage, 'run');

    await resolveAppConfigForUser(mockGetAppConfig, { role: 'USER' });
    expect(runSpy).not.toHaveBeenCalled();

    await resolveAppConfigForUser(mockGetAppConfig, { tenantId: 'tenant-b', role: 'ADMIN' });
    expect(runSpy).toHaveBeenCalledWith({ tenantId: 'tenant-b' }, expect.any(Function));

    runSpy.mockRestore();
  });

  it('makes tenantId available via ALS inside getAppConfig', async () => {
    let capturedContext: { tenantId?: string } | undefined;
    mockGetAppConfig.mockImplementation(async () => {
      capturedContext = tenantStorage.getStore();
      return { registration: {} };
    });

    await resolveAppConfigForUser(mockGetAppConfig, { tenantId: 'tenant-c', role: 'USER' });

    expect(capturedContext).toEqual({ tenantId: 'tenant-c' });
  });

  it('returns the config from getAppConfig', async () => {
    const tenantConfig = { registration: { allowedDomains: ['example.com'] } };
    mockGetAppConfig.mockResolvedValue(tenantConfig);

    const result = await resolveAppConfigForUser(mockGetAppConfig, {
      tenantId: 'tenant-d',
      role: 'USER',
    });

    expect(result).toBe(tenantConfig);
  });

  it('calls getAppConfig with role undefined when user has tenantId but no role', async () => {
    await resolveAppConfigForUser(mockGetAppConfig, { tenantId: 'tenant-e' });
    expect(mockGetAppConfig).toHaveBeenCalledWith({ role: undefined, tenantId: 'tenant-e' });
  });

  it('propagates rejection from getAppConfig for tenant users', async () => {
    mockGetAppConfig.mockRejectedValue(new Error('config unavailable'));
    await expect(
      resolveAppConfigForUser(mockGetAppConfig, { tenantId: 'tenant-f', role: 'USER' }),
    ).rejects.toThrow('config unavailable');
  });

  it('propagates rejection from getAppConfig for baseOnly path', async () => {
    mockGetAppConfig.mockRejectedValue(new Error('cache failure'));
    await expect(resolveAppConfigForUser(mockGetAppConfig, null)).rejects.toThrow('cache failure');
  });
});
