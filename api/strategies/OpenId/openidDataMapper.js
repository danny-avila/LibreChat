const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { decode } = require('jsonwebtoken');
const { logger } = require('~/config');
const { URL } = require('url');

// Microsoft SDK
const { Client: MicrosoftGraphClient } = require('@microsoft/microsoft-graph-client');

// AWS SDK for Cognito
const { CognitoIdentityProviderClient, GetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Keycloak Admin Client
const KcAdminClient = require('@keycloak/keycloak-admin-client');

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
   * Map custom OpenID data using the Microsoft Graph SDK.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Fields to select from the Microsoft Graph API.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      const fields = Array.isArray(customQuery) ? customQuery.join(',') : customQuery;
      const client = MicrosoftGraphClient.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
        fetch: fetch,
        ...this.getProxyOptions(),
      });

      const result = await client.api('/me').select(fields).get();
      return this.cleanOdataKeys(result);
    } catch (error) {
      logger.error(`[MicrosoftDataMapper] Error: ${error.message}`);
      return new Map();
    }
  }

  /**
   * Recursively remove all keys starting with @odata. from an object and convert objects to Maps.
   *
   * @param {object} obj - The object to clean and convert.
   * @returns {Map<string, any>| Array<any> | any} - The cleaned and converted object.
   */
  cleanOdataKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanOdataKeys(item));
    } else if (obj && typeof obj === 'object') {
      const cleanedEntries = Object.entries(obj)
        .filter(([key]) => !key.startsWith('@odata.'))
        .map(([key, value]) => [key, this.cleanOdataKeys(value)]);
      return new Map(cleanedEntries);
    }
    return obj;
  }
}

/**
 * Keycloak-specific data mapper using Keycloak Admin Client.
 */
class KeycloakDataMapper extends BaseDataMapper {
  constructor() {
    super();

    const issuer = process.env.OPENID_ISSUER;

    if (!issuer) {
      throw new Error('OPENID_ISSUER environment variable is not set.');
    }

    try {
      // Parse the URL and validate the structure
      const parsedUrl = new URL(issuer);
      const realmsSegment = '/realms/';
      const realmsIndex = parsedUrl.pathname.indexOf(realmsSegment);

      if (realmsIndex === -1) {
        throw new Error('OPENID_ISSUER must include \'/realms/<realm>\'');
      }

      // Extract baseUrl and realmName
      const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname.slice(0, realmsIndex)}`;
      const realmName = parsedUrl.pathname.slice(realmsIndex + realmsSegment.length);

      if (!realmName) {
        throw new Error('Realm name is missing in OPENID_ISSUER.');
      }

      // Initialize the client
      this.client = new KcAdminClient({
        baseUrl,
        realmName,
        ...this.getProxyOptions(),
      });
    } catch (error) {
      throw new Error(`Invalid OPENID_ISSUER format: ${error.message}`);
    }
  }

  /**
   * Map custom OpenID data using Keycloak's Admin SDK.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Not used in this implementation but kept for consistency.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    if (!accessToken || typeof accessToken !== 'string') {
      logger.error('[KeycloakDataMapper] Invalid access token provided.');
      return new Map();
    }

    try {
      // Authenticate the admin client with the access token
      await this.client.auth({
        grantType: 'bearer',
        accessToken: accessToken,
      });

      // Extract the user ID from the access token
      const userId = this._getUserIdFromToken(accessToken);
      if (!userId) {
        throw new Error('Unable to extract user ID from access token.');
      }

      // Fetch the current user
      const user = await this.client.users.findOne({ id: userId });

      if (!user) {
        throw new Error('User not found in Keycloak.');
      }

      // If customQuery is provided as an array, filter the user data accordingly
      if (Array.isArray(customQuery) && customQuery.length > 0) {
        const filteredData = {};
        customQuery.forEach((field) => {
          if (user.hasOwnProperty(field)) {
            filteredData[field] = user[field];
          }
        });
        return new Map(Object.entries(filteredData));
      }

      // Return all user data if no customQuery is provided
      return new Map(Object.entries(user));
    } catch (error) {
      logger.error(`[KeycloakDataMapper] Error fetching user data: ${error.message}`, { stack: error.stack });
      return new Map();
    }
  }

  /**
   * Extracts the user ID from the access token using JWT verification.
   * This method assumes that the access token is a JWT and contains the `sub` claim.
   *
   * @param {string} accessToken - The JWT access token.
   * @returns {string} The user ID (`sub` claim) from the token.
   * @throws {Error} If the token is invalid or the `sub` claim is missing.
   */
  _getUserIdFromToken(accessToken) {
    try {
      const decoded = decode(accessToken);
      if (!decoded || typeof decoded !== 'object') {
        throw new Error('Unable to decode JWT.');
      }

      const userId = decoded.sub;
      if (!userId) {
        throw new Error('The access token does not contain a "sub" claim.');
      }

      return userId;
    } catch (error) {
      throw new Error(`Invalid access token format: ${error.message}`);
    }
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
  // Not Tested
  keycloak: KeycloakDataMapper,
};

/**
 * Abstraction layer that returns a provider-specific mapper instance.
 */
class OpenIdDataMapper {
  /**
   * Retrieve an instance of the mapper for the specified provider.
   *
   * @param {string} provider - The name of the provider (e.g., 'aws_cognito', 'microsoft', 'keycloak').
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
