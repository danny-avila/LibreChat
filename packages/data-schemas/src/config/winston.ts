import winston from 'winston';
import 'winston-daily-rotate-file';
import {
  redactFormat,
  redactMessage,
  debugTraverse,
  jsonTruncateFormat,
  stripHeavyErrorFields,
} from './parsers';
import { appendLogContext, attachRequestContext } from './requestLogContext';
import { getLogDirectory } from './utils';

const { NODE_ENV, DEBUG_LOGGING, CONSOLE_JSON, DEBUG_CONSOLE, LOG_TO_FILE } = process.env;

const useConsoleJson = typeof CONSOLE_JSON === 'string' && CONSOLE_JSON.toLowerCase() === 'true';

const useDebugConsole = typeof DEBUG_CONSOLE === 'string' && DEBUG_CONSOLE.toLowerCase() === 'true';

const useDebugLogging = typeof DEBUG_LOGGING === 'string' && DEBUG_LOGGING.toLowerCase() === 'true';

const useFileLogging = typeof LOG_TO_FILE !== 'string' || LOG_TO_FILE.toLowerCase() !== 'false';

const levels: winston.config.AbstractConfigSetLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  activity: 6,
  silly: 7,
};

const requestContextFormat = winston.format(attachRequestContext);

winston.addColors({
  info: 'green',
  warn: 'italic yellow',
  error: 'red',
  debug: 'blue',
});

const level = (): string => {
  const env = NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'warn';
};

const fileFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  stripHeavyErrorFields(),
  winston.format.splat(),
  requestContextFormat(),
);

const transports: winston.transport[] = [];

if (useFileLogging) {
  const logDir = getLogDirectory();

  transports.push(
    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: `${logDir}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(fileFormat, winston.format.json()),
    }),
  );

  if (useDebugLogging) {
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
}

const consoleFormat = winston.format.combine(
  redactFormat(),
  requestContextFormat(),
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => {
    const message = `${info.timestamp} ${info.level}: ${info.message}`;
    const line = appendLogContext(message, info);
    return info.level.includes('error') ? redactMessage(line) : line;
  }),
);

let consoleLogLevel: string = 'info';
if (useDebugConsole) {
  consoleLogLevel = 'debug';
}

// Add console transport
if (useDebugConsole) {
  transports.push(
    new winston.transports.Console({
      level: consoleLogLevel,
      format: useConsoleJson
        ? winston.format.combine(fileFormat, jsonTruncateFormat(), winston.format.json())
        : winston.format.combine(fileFormat, debugTraverse),
    }),
  );
} else if (useConsoleJson) {
  transports.push(
    new winston.transports.Console({
      level: consoleLogLevel,
      format: winston.format.combine(fileFormat, jsonTruncateFormat(), winston.format.json()),
    }),
  );
} else {
  transports.push(
    new winston.transports.Console({
      level: consoleLogLevel,
      format: consoleFormat,
    }),
  );
}

// Create logger
const logger: winston.Logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

export default logger;
