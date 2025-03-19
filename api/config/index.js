const axios = require('axios');
const { EventSource } = require('eventsource');
const { Time, CacheKeys } = require('librechat-data-provider');
const logger = require('./winston');

global.EventSource = EventSource;

let mcpManager = null;
let flowManager = null;

/**
 * @returns {Promise<MCPManager>}
 */
async function getMCPManager() {
  if (!mcpManager) {
    const { MCPManager } = await import('librechat-mcp');
    mcpManager = MCPManager.getInstance(logger);
  }
  return mcpManager;
}

/**
 * @param {(key: string) => Keyv} getLogStores
 * @returns {Promise<FlowStateManager>}
 */
async function getFlowStateManager(getLogStores) {
  if (!flowManager) {
    const { FlowStateManager } = await import('librechat-mcp');
    flowManager = new FlowStateManager(getLogStores(CacheKeys.FLOWS), {
      ttl: Time.ONE_MINUTE * 3,
      logger,
    });
  }
  return flowManager;
}

/**
 * Sends message data in Server Sent Events format.
 * @param {ServerResponse} res - The server response.
 * @param {{ data: string | Record<string, unknown>, event?: string }} event - The message event.
 * @param {string} event.event - The type of event.
 * @param {string} event.data - The message to be sent.
 */
const sendEvent = (res, event) => {
  if (typeof event.data === 'string' && event.data.length === 0) {
    return;
  }
  res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
};

/**
 * Creates and configures an Axios instance with optional proxy settings.
 *
 * @typedef {import('axios').AxiosInstance} AxiosInstance
 * @typedef {import('axios').AxiosProxyConfig} AxiosProxyConfig
 *
 * @returns {AxiosInstance} A configured Axios instance
 * @throws {Error} If there's an issue creating the Axios instance or parsing the proxy URL
 */
function createAxiosInstance() {
  const instance = axios.create();

  if (process.env.proxy) {
    try {
      const url = new URL(process.env.proxy);

      /** @type {AxiosProxyConfig} */
      const proxyConfig = {
        host: url.hostname.replace(/^\[|\]$/g, ''),
        protocol: url.protocol.replace(':', ''),
      };

      if (url.port) {
        proxyConfig.port = parseInt(url.port, 10);
      }

      instance.defaults.proxy = proxyConfig;
    } catch (error) {
      console.error('Error parsing proxy URL:', error);
      throw new Error(`Invalid proxy URL: ${process.env.proxy}`);
    }
  }

  return instance;
}

module.exports = {
  logger,
  sendEvent,
  getMCPManager,
  createAxiosInstance,
  getFlowStateManager,
};
