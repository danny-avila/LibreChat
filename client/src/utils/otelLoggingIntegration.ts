import * as logsAPI from '@opentelemetry/api-logs';

interface ConsoleLoggerOptions {
  level?: string;
  loggerProvider: logsAPI.LoggerProvider;
  loggerName?: string;
}

interface LogInfo {
  level: string;
  message: string;
  timestamp?: string;
  [key: string]: any;
}

class OpenTelemetryConsoleLogger {
  public name: string;
  public level: string;
  private loggerProvider: logsAPI.LoggerProvider;
  private logger: logsAPI.Logger;
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    debug: typeof console.debug;
    info: typeof console.info;
  };
  private isLogging = false; // Prevent infinite recursion

  constructor(opts: ConsoleLoggerOptions) {
    this.name = 'opentelemetry-console';
    this.level = opts.level || 'debug';
    this.loggerProvider = opts.loggerProvider;
    this.logger = this.loggerProvider.getLogger(opts.loggerName || 'default');

    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      debug: console.debug.bind(console),
      info: console.info.bind(console),
    };

    // Intercept console methods
    this.interceptConsole();
  }

  private safeStringify(obj: any, maxLength = 10000): string {
    try {
      // Handle circular references and limit depth
      const seen = new WeakSet();
      const result = JSON.stringify(obj, (key, val) => {
        if (val != null && typeof val === 'object') {
          if (seen.has(val)) {
            return '[Circular]';
          }
          seen.add(val);
        }
        return val;
      });

      // Truncate if too long
      if (result.length > maxLength) {
        return result.substring(0, maxLength) + '...[truncated]';
      }

      return result;
    } catch (error) {
      return '[Unable to stringify object]';
    }
  }

  private formatArgs(args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') {
          return arg;
        } else if (typeof arg === 'object' && arg !== null) {
          return this.safeStringify(arg);
        } else {
          return String(arg);
        }
      })
      .join(' ');
  }

  private interceptConsole(): void {
    console.log = (...args: any[]) => {
      if (!this.isLogging) {
        this.isLogging = true;
        try {
          const message = this.formatArgs(args);
          this.captureLog('info', message);
        } catch (error) {
          // Silently fail to avoid breaking the app
        } finally {
          this.isLogging = false;
        }
      }
      this.originalConsole.log(...args);
    };

    console.error = (...args: any[]) => {
      if (!this.isLogging) {
        this.isLogging = true;
        try {
          const message = this.formatArgs(args);
          this.captureLog('error', message);
        } catch (error) {
          // Silently fail
        } finally {
          this.isLogging = false;
        }
      }
      this.originalConsole.error(...args);
    };

    console.warn = (...args: any[]) => {
      if (!this.isLogging) {
        this.isLogging = true;
        try {
          const message = this.formatArgs(args);
          this.captureLog('warn', message);
        } catch (error) {
          // Silently fail
        } finally {
          this.isLogging = false;
        }
      }
      this.originalConsole.warn(...args);
    };

    console.debug = (...args: any[]) => {
      if (!this.isLogging) {
        this.isLogging = true;
        try {
          const message = this.formatArgs(args);
          this.captureLog('debug', message);
        } catch (error) {
          // Silently fail
        } finally {
          this.isLogging = false;
        }
      }
      this.originalConsole.debug(...args);
    };

    console.info = (...args: any[]) => {
      if (!this.isLogging) {
        this.isLogging = true;
        try {
          const message = this.formatArgs(args);
          this.captureLog('info', message);
        } catch (error) {
          // Silently fail
        } finally {
          this.isLogging = false;
        }
      }
      this.originalConsole.info(...args);
    };
  }

  private captureLog(level: string, message: string, additionalData?: Record<string, any>): void {
    // Skip if message is too long or empty
    if (!message || message.length > 50000) {
      return;
    }

    const info: LogInfo = {
      level,
      message: message.substring(0, 10000), // Limit message length
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    // Only send to OpenTelemetry
    this.logToOpenTelemetry(info);
  }

  // Keep your existing methods for direct usage
  log(level: string, message: string, additionalData?: Record<string, any>): void {
    if (!this.isLogging) {
      this.captureLog(level, message, additionalData);
      this.originalConsole.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  error(message: string, data?: Record<string, any>): void {
    if (!this.isLogging) {
      this.captureLog('error', message, data);
      this.originalConsole.error(`[ERROR] ${message}`);
    }
  }

  warn(message: string, data?: Record<string, any>): void {
    if (!this.isLogging) {
      this.captureLog('warn', message, data);
      this.originalConsole.warn(`[WARN] ${message}`);
    }
  }

  info(message: string, data?: Record<string, any>): void {
    if (!this.isLogging) {
      this.captureLog('info', message, data);
      this.originalConsole.info(`[INFO] ${message}`);
    }
  }

  debug(message: string, data?: Record<string, any>): void {
    if (!this.isLogging) {
      this.captureLog('debug', message, data);
      this.originalConsole.debug(`[DEBUG] ${message}`);
    }
  }

  private logToOpenTelemetry(info: LogInfo): void {
    try {
      const severityMap: Record<string, logsAPI.SeverityNumber> = {
        error: logsAPI.SeverityNumber.ERROR,
        warn: logsAPI.SeverityNumber.WARN,
        info: logsAPI.SeverityNumber.INFO,
        http: logsAPI.SeverityNumber.INFO,
        verbose: logsAPI.SeverityNumber.DEBUG,
        debug: logsAPI.SeverityNumber.DEBUG,
        silly: logsAPI.SeverityNumber.TRACE,
      };

      const severityText = info.level.toUpperCase();
      const attributes: Record<string, any> = {
        'log.type': 'console',
        level: severityText,
      };

      // Safely add additional attributes
      if (typeof info === 'object' && info !== null) {
        Object.keys(info).forEach((key: string) => {
          if (!['level', 'message', 'timestamp'].includes(key)) {
            const value = info[key];
            // Only add simple values to avoid serialization issues
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean'
            ) {
              attributes[key] = value;
            } else if (typeof value === 'object' && value !== null) {
              attributes[key] = this.safeStringify(value, 1000);
            }
          }
        });
      }

      this.logger.emit({
        severityNumber: severityMap[info.level] || logsAPI.SeverityNumber.INFO,
        severityText: severityText,
        body: info.message,
        attributes: attributes,
      });
    } catch (error) {
      // Silently fail to avoid breaking the application
      this.originalConsole.error('Failed to send log to OpenTelemetry:', error);
    }
  }

  restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
  }
}

export default OpenTelemetryConsoleLogger;
