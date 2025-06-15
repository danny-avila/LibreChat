import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import type { AxiosInstance, AxiosProxyConfig, AxiosError } from 'axios';

/**
 * Logs Axios errors based on the error object and a custom message.
 * @param options - The options object.
 * @param options.message - The custom message to be logged.
 * @param options.error - The Axios error object.
 * @returns The log message.
 */
export const logAxiosError = ({ message, error }: { message: string; error: AxiosError }) => {
  let logMessage = message;
  try {
    const stack = error.stack || 'No stack trace available';

    if (error.response?.status) {
      const { status, headers, data } = error.response;
      logMessage = `${message} The server responded with status ${status}: ${error.message}`;
      logger.error(logMessage, {
        status,
        headers,
        data,
        stack,
      });
    } else if (error.request) {
      const { method, url } = error.config || {};
      logMessage = `${message} No response received for ${method ? method.toUpperCase() : ''} ${url || ''}: ${error.message}`;
      logger.error(logMessage, {
        requestInfo: { method, url },
        stack,
      });
    } else if (error?.message?.includes("Cannot read properties of undefined (reading 'status')")) {
      logMessage = `${message} It appears the request timed out or was unsuccessful: ${error.message}`;
      logger.error(logMessage, { stack });
    } else {
      logMessage = `${message} An error occurred while setting up the request: ${error.message}`;
      logger.error(logMessage, { stack });
    }
  } catch (err: unknown) {
    logMessage = `Error in logAxiosError: ${(err as Error).message}`;
    logger.error(logMessage, { stack: (err as Error).stack || 'No stack trace available' });
  }
  return logMessage;
};

/**
 * Creates and configures an Axios instance with optional proxy settings.

 * @returns A configured Axios instance
 * @throws If there's an issue creating the Axios instance or parsing the proxy URL
 */
export function createAxiosInstance(): AxiosInstance {
  const instance = axios.create();

  if (process.env.proxy) {
    try {
      const url = new URL(process.env.proxy);

      const proxyConfig: Partial<AxiosProxyConfig> = {
        host: url.hostname.replace(/^\[|\]$/g, ''),
        protocol: url.protocol.replace(':', ''),
      };

      if (url.port) {
        proxyConfig.port = parseInt(url.port, 10);
      }

      instance.defaults.proxy = proxyConfig as AxiosProxyConfig;
    } catch (error) {
      console.error('Error parsing proxy URL:', error);
      throw new Error(`Invalid proxy URL: ${process.env.proxy}`);
    }
  }

  return instance;
}
