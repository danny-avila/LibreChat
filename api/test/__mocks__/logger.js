jest.mock('winston', () => {
  const mockFormatFunction = jest.fn((fn) => {
    // Return a function that handles the info object properly
    return () => ({
      transform: (info) => {
        // Ensure info has required properties
        if (!info || typeof info !== 'object') {
          return { level: 'info', message: '' };
        }
        // Call the original function if it exists
        if (typeof fn === 'function') {
          return fn(info) || info;
        }
        return info;
      }
    });
  });

  mockFormatFunction.colorize = jest.fn();
  mockFormatFunction.combine = jest.fn();
  mockFormatFunction.label = jest.fn();
  mockFormatFunction.timestamp = jest.fn();
  mockFormatFunction.printf = jest.fn();
  mockFormatFunction.errors = jest.fn();
  mockFormatFunction.splat = jest.fn();
  mockFormatFunction.json = jest.fn();
  return {
    format: mockFormatFunction,
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    }),
    transports: {
      Console: jest.fn(),
      DailyRotateFile: jest.fn(),
      File: jest.fn(),
    },
    addColors: jest.fn(),
  };
});

jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => {
    return {
      level: 'error',
      filename: '../logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: 'format',
    };
  });
});

jest.mock('~/config', () => {
  const actualModule = jest.requireActual('~/config');
  return {
    sendEvent: actualModule.sendEvent,
    createAxiosInstance: actualModule.createAxiosInstance,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
  };
});

jest.mock('~/config/parsers', () => {
  return {
    redactMessage: jest.fn((msg) => msg),
    redactFormat: jest.fn(() => ({
      transform: (info) => info
    })),
    debugTraverse: jest.fn(() => ({
      transform: (info) => info
    })),
    jsonTruncateFormat: jest.fn(() => ({
      transform: (info) => info
    })),
  };
});
