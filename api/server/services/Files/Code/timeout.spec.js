jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));

describe('getCodeApiTimeoutMs', () => {
  const originalValue = process.env.LIBRECHAT_CODE_TIMEOUT_MS;
  let getCodeApiTimeoutMs;
  let logger;

  beforeEach(() => {
    /** Fresh module per test so the warn-once guard starts clean; the logger mock is
     * re-required alongside it, since resetModules gives the module a new instance. */
    jest.resetModules();
    ({ logger } = require('@librechat/data-schemas'));
    ({ getCodeApiTimeoutMs } = require('./timeout'));
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.LIBRECHAT_CODE_TIMEOUT_MS;
    } else {
      process.env.LIBRECHAT_CODE_TIMEOUT_MS = originalValue;
    }
  });

  it('returns the 15 s default when unset or blank', () => {
    delete process.env.LIBRECHAT_CODE_TIMEOUT_MS;
    expect(getCodeApiTimeoutMs()).toBe(15000);
    process.env.LIBRECHAT_CODE_TIMEOUT_MS = '  ';
    expect(getCodeApiTimeoutMs()).toBe(15000);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns the configured value', () => {
    process.env.LIBRECHAT_CODE_TIMEOUT_MS = '60000';
    expect(getCodeApiTimeoutMs()).toBe(60000);
    process.env.LIBRECHAT_CODE_TIMEOUT_MS = ' 30000 ';
    expect(getCodeApiTimeoutMs()).toBe(30000);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5e4'], ['15s']])(
    'falls back to the default and warns once for the invalid value %j',
    (value) => {
      process.env.LIBRECHAT_CODE_TIMEOUT_MS = value;
      expect(getCodeApiTimeoutMs()).toBe(15000);
      expect(getCodeApiTimeoutMs()).toBe(15000);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`LIBRECHAT_CODE_TIMEOUT_MS=${value} is not a positive integer`),
      );
    },
  );
});
