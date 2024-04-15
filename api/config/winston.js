const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { redactFormat, redactMessage, debugTraverse } = require('./parsers');

const logDir = path.join(__dirname, '..', 'logs');
const basePath = path.resolve(__dirname, '..');

const { NODE_ENV, DEBUG_LOGGING = true, DEBUG_CONSOLE = false, CONSOLE_JSON = false } = process.env;

const useConsoleJson =
  (typeof CONSOLE_JSON === 'string' && CONSOLE_JSON?.toLowerCase() === 'true') ||
  CONSOLE_JSON === true;

const useDebugConsole =
  (typeof DEBUG_CONSOLE === 'string' && DEBUG_CONSOLE?.toLowerCase() === 'true') ||
  DEBUG_CONSOLE === true;

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  activity: 6,
  silly: 7,
};

function wrapLogMethod(originalMethod) {
  return function (message, ...args) {
    const err = new Error();
    const stack = err.stack.split('\n');
    // Start parsing from the first relevant entry, which seems to be the second one based on your stack example.
    let relevantStack = stack[2] || stack[1]; // Fallback to an earlier stack if needed
    // Adjusted regex to optionally match function calls in parentheses
    let match = relevantStack
      ? /at\s+(?:.*?\s+)?\(?([^)]+):(\d+):(\d+)\)?/.exec(relevantStack)
      : null;

    if (!match) {
      // Try a broader regex if the first one fails
      match = relevantStack ? /at\s+.*?\((.*?):(\d+):(\d+)\)/.exec(relevantStack) : null;
    }

    if (match) {
      // Calculate the relative path based on the basePath you define
      const relativePath = path.relative(basePath, match[1]);
      message = `[./api/${relativePath}:${match[2]}] ${message}`;
    } else {
      // Log the entire stack if no match is found (optional, for debugging purposes)
      console.log('Failed to parse stack:', err.stack);
      message = `[can't detect location] ${message}`;
    }

    originalMethod.call(this, message, ...args);
  };
}

winston.addColors({
  info: 'green', // fontStyle color
  warn: 'italic yellow',
  error: 'red',
  debug: 'blue',
});

const level = () => {
  const env = NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

const fileFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf((info) => `${info.timestamp} [${info.level}]: ${info.message}`),
);

const transports = [
  new winston.transports.DailyRotateFile({
    level: 'error',
    filename: `${logDir}/error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat,
  }),
  // new winston.transports.Console({
  //   level: level(),
  //   format: fileFormat,
  // }),
  // new winston.transports.DailyRotateFile({
  //   level: 'info',
  //   filename: `${logDir}/info-%DATE%.log`,
  //   datePattern: 'YYYY-MM-DD',
  //   zippedArchive: true,
  //   maxSize: '20m',
  //   maxFiles: '14d',
  // }),
];

if (
  (typeof DEBUG_LOGGING === 'string' && DEBUG_LOGGING?.toLowerCase() === 'true') ||
  DEBUG_LOGGING === true
) {
  transports.push(
    new winston.transports.DailyRotateFile({
      level: 'debug',
      filename: `${logDir}/debug-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(fileFormat, debugTraverse),
    }),
  );
}

const consoleFormat = winston.format.combine(
  redactFormat(),
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  // redactErrors(),
  winston.format.printf((info) => {
    const message = `${info.timestamp} ${info.level}: ${info.message}`;
    if (info.level.includes('error')) {
      return redactMessage(message);
    }

    return message;
  }),
);

if (useDebugConsole) {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: useConsoleJson
        ? winston.format.combine(fileFormat, debugTraverse, winston.format.json())
        : winston.format.combine(fileFormat, debugTraverse),
    }),
  );
} else if (useConsoleJson) {
  transports.push(
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(fileFormat, winston.format.json()),
    }),
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: 'info',
      format: consoleFormat,
    }),
  );
}

const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

// Wrap all logger methods to include file and line numbers
Object.keys(levels).forEach((level) => {
  const originalMethod = logger[level];
  if (typeof originalMethod === 'function') {
    logger[level] = wrapLogMethod(originalMethod.bind(logger), level);
  }
});

module.exports = logger;
