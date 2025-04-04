const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'logs');

const { NODE_ENV, DEBUG_LOGGING = false } = process.env;

const useDebugLogging =
  (typeof DEBUG_LOGGING === 'string' && DEBUG_LOGGING?.toLowerCase() === 'true') ||
  DEBUG_LOGGING === true;

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
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
);

const logLevel = useDebugLogging ? 'debug' : 'error';
const transports = [
  new winston.transports.DailyRotateFile({
    level: logLevel,
    filename: `${logDir}/meiliSync-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat,
  }),
];

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
);

transports.push(
  new winston.transports.Console({
    level: 'info',
    format: consoleFormat,
  }),
);

const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
});

module.exports = logger;
