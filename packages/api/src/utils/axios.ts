import axios from 'axios';
import type { AxiosInstance, AxiosProxyConfig } from 'axios';

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
