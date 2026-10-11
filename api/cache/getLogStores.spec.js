const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('./getLogStores');

describe('auditCache', () => {
  it('logs counts and TTL info without cache keys or values', async () => {
    const secretKey = 'user-id-1234567890';
    const secretValue = 'super-secret-access-token';
    const store = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    await store.set(secretKey, { access_token: secretValue });

    const debug = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    getLogStores.auditCache();

    const output = JSON.stringify(debug.mock.calls);
    expect(output).toContain(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    expect(output).toContain('"count":1');
    expect(output).not.toContain(secretValue);
    expect(output).not.toContain(secretKey);
    expect(log).not.toHaveBeenCalled();

    debug.mockRestore();
    log.mockRestore();
    await store.clear();
  });
});
