const isDevelopment = import.meta.env.MODE === 'development';
const isLoggerEnabled = import.meta.env.VITE_ENABLE_LOGGER === 'true';

const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.error(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.info(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.debug(...args);
    }
  },
  dir: (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      console.dir(...args);
    }
  },
};

export default logger;
