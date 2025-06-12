jest.mock('winston', () => {
  const mockFormatFunction = jest.fn((fn) => {
    // Return a function that creates an object with level property
    return () => ({
      level: 'info',
      message: '',
      timestamp: new Date().toISOString(),
    });
  });

  mockFormatFunction.colorize = jest.fn(() => mockFormatFunction);
  mockFormatFunction.combine = jest.fn(() => mockFormatFunction);
  mockFormatFunction.label = jest.fn(() => mockFormatFunction);
  mockFormatFunction.timestamp = jest.fn(() => mockFormatFunction);
  mockFormatFunction.printf = jest.fn(() => mockFormatFunction);
  mockFormatFunction.errors = jest.fn(() => mockFormatFunction);
  mockFormatFunction.splat = jest.fn(() => mockFormatFunction);
  mockFormatFunction.json = jest.fn(() => mockFormatFunction);
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
    redactMessage: jest.fn(),
    redactFormat: jest.fn(),
    debugTraverse: jest.fn(),
  };
});
