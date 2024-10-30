const isDevelopment = import.meta.env.MODE === 'development';
const isLoggerEnabled = import.meta.env.VITE_ENABLE_LOGGER === 'true';
const loggerFilter = import.meta.env.VITE_LOGGER_FILTER || '';

type LogFunction = (...args: unknown[]) => void;

const createLogFunction = (consoleMethod: LogFunction): LogFunction => {
  return (...args: unknown[]) => {
    if (isDevelopment || isLoggerEnabled) {
      const tag = typeof args[0] === 'string' ? args[0] : '';
      if (shouldLog(tag)) {
        if (tag && args.length > 1) {
          consoleMethod(`[${tag}]`, ...args.slice(1));
        } else {
          consoleMethod(...args);
        }
      }
    }
  };
};

const logger = {
  log: createLogFunction(console.log),
  warn: createLogFunction(console.warn),
  error: createLogFunction(console.error),
  info: createLogFunction(console.info),
  debug: createLogFunction(console.debug),
  dir: createLogFunction(console.dir),
};

function shouldLog(tag: string): boolean {
  if (!loggerFilter) {
    return true;
  }
  /* If no tag is provided, always log */
  if (!tag) {
    return true;
  }
  return loggerFilter
    .split(',')
    .some((filter) => tag.toLowerCase().includes(filter.trim().toLowerCase()));
}

export default logger;
