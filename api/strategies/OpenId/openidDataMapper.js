const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { logger } = require('~/config');

// Microsoft SDK
const { Client: MicrosoftGraphClient } = require('@microsoft/microsoft-graph-client');

// Google SDK
const { google } = require('googleapis');
const { OAuth2 } = require('google-auth-library');

// GitHub SDK
const { Octokit } = require('@octokit/rest');

// Okta SDK
const { OktaAuth } = require('@okta/okta-auth-js');

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
   * Optionally handle proxy settings for SDK clients.
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
 * Google-specific data mapper using the Google People API.
 */
class GoogleDataMapper extends BaseDataMapper {
  /**
   * Map custom OpenID data using the Google People API.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Fields to select from the Google People API.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      const oauth2Client = new OAuth2();
      const fields = Array.isArray(customQuery) ? customQuery.join(',') : customQuery;

      oauth2Client.setCredentials({ access_token: accessToken });

      const people = google.people({
        version: 'v1',
        auth: oauth2Client,
        ...this.getProxyOptions(),
      });

      const res = await people.people.get({
        resourceName: 'people/me',
        personFields: fields,
      });

      return new Map(Object.entries(res.data));
    } catch (error) {
      logger.error(`[GoogleDataMapper] Error: ${error.message}`);
      return new Map();
    }
  }
}

/**
 * GitHub-specific data mapper using the GitHub SDK.
 */
class GitHubDataMapper extends BaseDataMapper {
  /**
   * Map custom OpenID data using the GitHub SDK.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Comma-separated string or array of fields to select (e.g., 'login,email,plan').
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      const octokit = new Octokit({
        auth: accessToken,
        request: {
          agent: this.getProxyOptions().agent,
        },
      });

      const { data } = await octokit.rest.users.getAuthenticated();

      let fields = [];
      if (typeof customQuery === 'string' && customQuery.trim() !== '') {
        fields = customQuery.split(',').map(field => field.trim());
      } else if (Array.isArray(customQuery)) {
        fields = customQuery;
      }

      // If no specific fields are requested, return all fields
      if (fields.length === 0) {
        return new Map(Object.entries(data));
      }

      // Filter the result to include only specified fields
      return this.filterFields(data, fields);
    } catch (error) {
      logger.error(`[GitHubDataMapper] Error: ${error.message}`);
      return new Map();
    }
  }

  /**
   * Filter the fields of an object based on the provided list.
   *
   * @param {object} obj - The object to filter.
   * @param {Array<string>} fields - The list of fields to retain.
   * @returns {Map<string, any>} - A Map containing only the specified fields.
   */
  filterFields(obj, fields) {
    const filtered = new Map();

    fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        filtered.set(field, obj[field]);
      }
    });

    return filtered;
  }
}

/**
 * Okta-specific data mapper using the OktaAuth from @okta/okta-auth-js.
 */
class OktaDataMapper extends BaseDataMapper {
  /**
   * Map custom OpenID data using the OktaAuth from @okta/okta-auth-js.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Comma-separated string or array of fields to select.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      const issuer = process.env.OPENID_ISSUER;
      if (!issuer) {
        throw new Error('OPENID_ISSUER environment variable is not set.');
      }

      // Initialize OktaAuth
      const oktaAuth = new OktaAuth({
        issuer: issuer,
        // Additional configuration if needed
        ...this.getProxyOptions(),
      });

      // Set the access token manually
      oktaAuth.tokenManager.add('accessToken', {
        accessToken: accessToken,
        tokenType: 'Bearer',
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // Assuming token expires in 1 hour
      });

      // Retrieve user info using the access token
      const userInfo = await oktaAuth.token.getUserInfo();

      let fields = [];
      if (typeof customQuery === 'string' && customQuery.trim() !== '') {
        fields = customQuery.split(',').map(field => field.trim());
      } else if (Array.isArray(customQuery)) {
        fields = customQuery;
      }

      // If no specific fields are requested, return all fields
      if (fields.length === 0) {
        return new Map(Object.entries(userInfo));
      }

      // Filter the result to include only specified fields
      return this.filterFields(userInfo, fields);
    } catch (error) {
      logger.error(`[OktaDataMapper] Error: ${error.message}`);
      return new Map();
    }
  }

  /**
   * Filter the fields of an object based on the provided list.
   *
   * @param {object} obj - The object to filter.
   * @param {Array<string>} fields - The list of fields to retain.
   * @returns {Map<string, any>} - A Map containing only the specified fields.
   */
  filterFields(obj, fields) {
    const filtered = new Map();

    fields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        filtered.set(field, obj[field]);
      }
    });

    return filtered;
  }
}

/**
 * Keycloak-specific data mapper using HTTP requests as there's no official SDK.
 */
class KeycloakDataMapper extends BaseDataMapper {
  /**
   * Map custom OpenID data using Keycloak's user info endpoint.
   *
   * @param {string} accessToken - The access token to authenticate the request.
   * @param {string|Array<string>} customQuery - Not used in this implementation but kept for consistency.
   * @returns {Promise<Map<string, any>>} A promise that resolves to a map of custom fields.
   */
  async mapCustomData(accessToken, customQuery) {
    try {
      const issuer = process.env.OPENID_ISSUER;
      if (!issuer) {
        throw new Error('OPENID_ISSUER environment variable is not set.');
      }

      const url = `${issuer}/protocol/openid-connect/userinfo`;
      const options = {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        ...this.getProxyOptions(),
      };

      const response = await fetch(url, options);
      if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Request failed with status ${response.status}: ${response.statusText} - ${errorDetails}`);
      }

      const result = await response.json();
      return new Map(Object.entries(result));
    } catch (error) {
      logger.error(`[KeycloakDataMapper] Error: ${error.message}`);
      return new Map();
    }
  }
}

/**
 * Map provider names to their specific data mappers.
 */
const PROVIDER_MAPPERS = {
  // Fully Working
  microsoft: MicrosoftDataMapper,
  // Maybe need some work.
  google: GoogleDataMapper,
  // Maybe need some work.
  keycloak: KeycloakDataMapper,
  // Maybe need some work.
  github: GitHubDataMapper,
  // Maybe need some work. (Assuming Auth0 uses Okta SDK)
  auth0: OktaDataMapper,
  // Maybe need some work. (Assuming Auth0 uses Okta SDK)
  okta: OktaDataMapper,
  // Additional providers can be added here.
};

/**
 * Abstraction layer that returns a provider-specific mapper instance.
 */
class OpenIdDataMapper {
  /**
   * Retrieve an instance of the mapper for the specified provider.
   *
   * @param {string} provider - The name of the provider (e.g. 'microsoft', 'google', 'keycloak', 'github', 'auth0', 'okta').
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
