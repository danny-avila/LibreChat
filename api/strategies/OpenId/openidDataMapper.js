const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { logger } = require('~/config');
const { URL } = require('url');

// Microsoft SDK
const { Client: MicrosoftGraphClient } = require('@microsoft/microsoft-graph-client');

/**
 * Base class for provider-specific data mappers.
 */
class BaseDataMapper {
  /**
   * Map custom OpenID data.
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Either a full query string (if it contains operators)
   *   or an array of fields to select.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   * @throws {Error} Throws an error if not implemented in the subclass.
   */
  async mapCustomData(accessToken, customQuery) {
    throw new Error('mapCustomData() must be implemented by subclasses');
  }

  /**
   * Optionally handle proxy settings for HTTP requests.
   * @returns {Object} Configuration object with proxy settings if PROXY is set.
   */
  getProxyOptions() {
    if (process.env.PROXY) {
      const agent = new HttpsProxyAgent(process.env.PROXY);
      return { agent };
    }
    return {};
  }
}

/**
 * Microsoft-specific data mapper using the Microsoft Graph SDK.
 */
class MicrosoftDataMapper extends BaseDataMapper {
  /**
   * Initializes the MicrosoftGraphClient once for reuse.
   */
  constructor() {
    super();
    this.accessToken = null;

    this.client = MicrosoftGraphClient.init({
      defaultVersion: 'beta',
      authProvider: (done) => {
        // The authProvider will be called for each request to get the token
        if (this.accessToken) {
          done(null, this.accessToken);
        } else {
          done(new Error('Access token is not set.'), null);
        }
      },
      fetch: fetch,
      ...this.getProxyOptions(),
    });

    // Bind methods to maintain context
    this.mapCustomData = this.mapCustomData.bind(this);
    this.cleanData = this.cleanData.bind(this);
  }

  /**
   * Set the access token for the client.
   * This method should be called before making any requests.
   *
   * @param {string} accessToken - The access token.
   */
  setAccessToken(accessToken) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('[MicrosoftDataMapper] Invalid access token provided.');
    }
    this.accessToken = accessToken;
  }

  /**
   * Map custom OpenID data using the Microsoft Graph SDK.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Fields to select from the Microsoft Graph API.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      this.setAccessToken(accessToken);

      if (!customQuery) {
        logger.warn('[MicrosoftDataMapper] No customQuery provided.');
        return new Map();
      }

      // Convert customQuery to a comma-separated string if it's an array
      const fields = Array.isArray(customQuery) ? customQuery.join(',') : customQuery;

      if (!fields) {
        logger.warn('[MicrosoftDataMapper] No fields specified in customQuery.');
        return new Map();
      }

      const result = await this.client
        .api('/me')
        .select(fields)
        .get();

      const cleanedData = this.cleanData(result);
      return new Map(Object.entries(cleanedData));
    } catch (error) {
      // Handle specific Microsoft Graph errors if needed
      logger.error(`[MicrosoftDataMapper] Error fetching user data: ${error.message}`, { stack: error.stack });
      return new Map();
    }
  }

  /**
   * Recursively remove all keys starting with @odata. from an object and convert Maps.
   *
   * @param {object|Array} obj - The object or array to clean.
   * @returns {object|Array} - The cleaned object or array.
   */
  cleanData(obj) {
    if (Array.isArray(obj)) {
      return obj.map(this.cleanData);
    } else if (obj && typeof obj === 'object') {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        if (!key.startsWith('@odata.')) {
          acc[key] = this.cleanData(value);
        }
        return acc;
      }, {});
    }
    return obj;
  }
}

/**
 * Map provider names to their specific data mappers.
 */
const PROVIDER_MAPPERS = {
  microsoft: MicrosoftDataMapper,
};

/**
 * Abstraction layer that returns a provider-specific mapper instance.
 */
class OpenIdDataMapper {
  /**
   * Retrieve an instance of the mapper for the specified provider.
   *
   * @param {string} provider - The name of the provider (e.g., 'microsoft').
   * @returns {BaseDataMapper} An instance of the specific data mapper for the provider.
   * @throws {Error} Throws an error if no mapper is found for the specified provider.
   */
  static getMapper(provider) {
    const MapperClass = PROVIDER_MAPPERS[provider.toLowerCase()];
    if (!MapperClass) {
      throw new Error(`No mapper found for provider: ${provider}`);
    }
    return new MapperClass();
  }
}

module.exports = OpenIdDataMapper;