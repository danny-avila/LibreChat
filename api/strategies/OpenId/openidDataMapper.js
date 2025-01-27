const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { logger } = require('~/config');
const { URL } = require('url');

// Microsoft SDK
const { Client: MicrosoftGraphClient } = require('@microsoft/microsoft-graph-client');

// AWS SDK for Cognito
const { CognitoIdentityProviderClient, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

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
 * AWS Cognito-specific data mapper using AWS SDK.
 */
class AWSCognitoDataMapper extends BaseDataMapper {
  constructor() {
    super();
    const issuer = process.env.OPENID_ISSUER;

    if (!issuer) {
      throw new Error('OPENID_ISSUER environment variable is not set.');
    }

    // Extract region from the OPENID_ISSUER
    const region = AWSCognitoDataMapper.extractRegionFromIssuer(issuer);
    if (!region) {
      throw new Error('Unable to extract AWS region from OPENID_ISSUER.');
    }

    this.client = new CognitoIdentityProviderClient({ region, ...this.getProxyOptions() });
  }

  /**
   * Extracts the AWS region from the OpenID Issuer URL.
   *
   * @param {string} issuer - The OpenID Issuer URL.
   * @returns {string|null} The extracted AWS region or null if not found.
   */
  static extractRegionFromIssuer(issuer) {
    try {
      const parsedUrl = new URL(issuer);
      const hostname = parsedUrl.hostname; // e.g., cognito-idp.us-west-2.amazonaws.com

      const regex = /^cognito-idp\.([a-z0-9-]+)\.amazonaws\.com$/;
      const match = hostname.match(regex);

      if (match && match[1]) {
        return match[1]; // Extracted region, e.g., us-west-2
      }

      return null;
    } catch (error) {
      logger.error(`[AWSCognitoDataMapper] Invalid OPENID_ISSUER URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Map custom OpenID data using AWS Cognito's SDK.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Comma-separated string or array of fields to select.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    if (!accessToken || typeof accessToken !== 'string') {
      logger.error('[AWSCognitoDataMapper] Invalid access token provided.');
      return new Map();
    }

    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const response = await this.client.send(command);

      // If customQuery is provided as an array, filter the response accordingly
      if (Array.isArray(customQuery) && customQuery.length > 0) {
        const filteredData = {};
        customQuery.forEach((field) => {
          if (response.hasOwnProperty(field)) {
            filteredData[field] = response[field];
          }
        });
        return new Map(Object.entries(filteredData));
      }

      // If customQuery is a string (assuming it's a full query string with operators),
      // implement custom logic if needed. For now, return the full response.
      return new Map(Object.entries(response));
    } catch (error) {
      logger.error(`[AWSCognitoDataMapper] Error fetching user data: ${error.message}`, { stack: error.stack });
      return new Map();
    }
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
  // Not Tested
  aws_cognito: AWSCognitoDataMapper,
  // Fully Working
  microsoft: MicrosoftDataMapper,
};

/**
 * Abstraction layer that returns a provider-specific mapper instance.
 */
class OpenIdDataMapper {
  /**
   * Retrieve an instance of the mapper for the specified provider.
   *
   * @param {string} provider - The name of the provider (e.g., 'aws_cognito', 'microsoft').
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
