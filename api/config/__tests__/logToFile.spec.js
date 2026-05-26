const fs = require('fs');

const ORIGINAL_ENV = process.env;

const mockDataSchemas = () => {
  jest.doMock('@librechat/data-schemas', () => ({
    getTenantId: jest.fn(),
    getUserId: jest.fn(),
    getRequestId: jest.fn(),
    SYSTEM_TENANT_ID: 'system',
  }));
};

const mockReadOnlyDockerLogDir = () => {
  const originalExistsSync = fs.existsSync;
  const originalMkdirSync = fs.mkdirSync;

  jest.spyOn(process, 'cwd').mockReturnValue('/app');
  jest
    .spyOn(fs, 'existsSync')
    .mockImplementation((target) =>
      target === '/app/logs' ? false : originalExistsSync.call(fs, target),
    );

  return jest.spyOn(fs, 'mkdirSync').mockImplementation((target, options) => {
    if (target === '/app/logs') {
      throw new Error('Attempted to create Docker log directory');
    }
    return originalMkdirSync.call(fs, target, options);
  });
};

const prepareLoggerWithoutFileLogging = () => {
  jest.resetModules();
  jest.clearAllMocks();
  mockDataSchemas();

  process.env = {
    ...ORIGINAL_ENV,
    DEBUG_LOGGING: 'true',
    LOG_TO_FILE: 'false',
  };

  return mockReadOnlyDockerLogDir();
};

describe('LOG_TO_FILE', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('does not create the API log directory when winston file logging is disabled', () => {
    const mkdirSyncSpy = prepareLoggerWithoutFileLogging();

    expect(() => require('../winston')).not.toThrow();

    const winston = require('winston');
    expect(winston.transports.DailyRotateFile).not.toHaveBeenCalled();
    expect(mkdirSyncSpy).not.toHaveBeenCalledWith('/app/logs', expect.anything());
  });

  it('does not create the API log directory when Meili file logging is disabled', () => {
    const mkdirSyncSpy = prepareLoggerWithoutFileLogging();

    expect(() => require('../meiliLogger')).not.toThrow();

    const winston = require('winston');
    expect(winston.transports.DailyRotateFile).not.toHaveBeenCalled();
    expect(mkdirSyncSpy).not.toHaveBeenCalledWith('/app/logs', expect.anything());
  });
});
