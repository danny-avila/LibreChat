const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { getMCPServersRegistry } = require('~/config');

/**
 * API Tool Executor
 * Executes API calls based on tool definitions generated from OpenAPI specs
 */
class APIToolExecutor {
  /**
   * Execute an API tool call
   * @param {Object} params
   * @param {string} params.serverName - API Registry server name
   * @param {string} params.toolName - Tool name
   * @param {Object} params.toolArguments - Tool input arguments
   * @param {string} params.userId - User ID
   * @param {Object} [params.customUserVars] - Custom user variables for auth
   * @returns {Promise<any>} API response
   */
  async executeTool({ serverName, toolName, toolArguments, userId, customUserVars }) {
    try {
      logger.info(`[APIToolExecutor] Executing tool: ${toolName} for server: ${serverName}`);

      // Get API config
      const registry = getMCPServersRegistry();
      const config = await registry.getServerConfig(serverName, userId);

      if (!config || !config.apiConfig) {
        throw new Error(`API registry not found: ${serverName}`);
      }

      // Find the endpoint definition for this tool
      const endpoint = this.findEndpointForTool(config.apiConfig, toolName);
      if (!endpoint) {
        throw new Error(`Endpoint not found for tool: ${toolName}`);
      }

      // Build the HTTP request
      const request = await this.buildRequest({
        config,
        endpoint,
        toolArguments,
        userId,
        customUserVars,
      });

      // Execute the request
      const response = await this.executeRequest(request);

      logger.info(`[APIToolExecutor] Tool executed successfully: ${toolName}`);
      return response;
    } catch (error) {
      logger.error(`[APIToolExecutor] Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Find endpoint definition for a tool
   * @param {Object} apiConfig - API configuration
   * @param {string} toolName - Tool name
   * @returns {Object|null} Endpoint definition
   */
  findEndpointForTool(apiConfig, toolName) {
    for (const [endpointKey, endpoint] of Object.entries(apiConfig.endpoints || {})) {
      const generatedToolName = this.generateToolName(apiConfig, endpoint.operationId);
      if (generatedToolName === toolName) {
        return { ...endpoint, endpointKey };
      }
    }
    return null;
  }

  /**
   * Generate tool name (must match OpenAPIParser.generateToolName)
   * @param {Object} apiConfig - API configuration
   * @param {string} operationId - Operation ID
   * @returns {string}
   */
  generateToolName(apiConfig, operationId) {
    const apiId = apiConfig.swaggerUrl.split('/').pop().replace(/\.(json|yaml|yml)$/, '');
    const sanitizedApiId = apiId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const sanitizedOpId = operationId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${sanitizedApiId}_${sanitizedOpId}`;
  }

  /**
   * Build HTTP request from endpoint and arguments
   * @param {Object} params
   * @returns {Promise<Object>} Request configuration
   */
  async buildRequest({ config, endpoint, toolArguments, userId, customUserVars }) {
    const { apiConfig } = config;
    let url = apiConfig.baseUrl + endpoint.path;
    const headers = { ...apiConfig.customHeaders };
    const queryParams = {};
    let body = null;

    // Process parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        const value = toolArguments[param.name];
        if (!value && param.required) {
          throw new Error(`Required parameter missing: ${param.name}`);
        }

        if (value) {
          if (param.in === 'path') {
            url = url.replace(`{${param.name}}`, encodeURIComponent(value));
          } else if (param.in === 'query') {
            queryParams[param.name] = value;
          } else if (param.in === 'header') {
            headers[param.name] = value;
          }
        }
      }
    }

    // Build request body
    if (endpoint.requestBody && endpoint.method !== 'GET') {
      const bodyParams = {};
      const bodySchema = endpoint.requestBody.content?.['application/json']?.schema;
      
      if (bodySchema?.properties) {
        for (const propName of Object.keys(bodySchema.properties)) {
          if (toolArguments[propName] !== undefined) {
            bodyParams[propName] = toolArguments[propName];
          }
        }
      }

      if (Object.keys(bodyParams).length > 0) {
        body = JSON.stringify(bodyParams);
        headers['Content-Type'] = 'application/json';
      }
    }

    // Add query parameters to URL
    if (Object.keys(queryParams).length > 0) {
      const queryString = new URLSearchParams(queryParams).toString();
      url += `?${queryString}`;
    }

    // Add authentication
    await this.addAuthentication({ config, headers, userId, customUserVars });

    return {
      url,
      method: endpoint.method,
      headers,
      body,
    };
  }

  /**
   * Add authentication to request headers
   * @param {Object} params
   */
  async addAuthentication({ config, headers, userId, customUserVars }) {
    const { apiConfig } = config;
    const auth = apiConfig.auth;

    if (!auth) {
      return;
    }

    const pluginKey = `${Constants.api_registry_prefix}${config.serverName || 'unknown'}`;

    if (auth.type === 'apiKey') {
      let apiKey;
      
      if (auth.source === 'user') {
        // Get from custom user vars or plugin auth
        apiKey = customUserVars?.API_KEY || 
                 await getUserPluginAuthValue(userId, 'API_KEY', true, pluginKey);
      } else {
        // Admin-provided key (stored in config)
        apiKey = auth.apiKey;
      }

      if (!apiKey) {
        throw new Error('API key not configured');
      }

      headers[auth.headerName || 'X-API-Key'] = apiKey;
    } else if (auth.type === 'bearer') {
      let token;
      
      if (auth.source === 'user') {
        token = customUserVars?.BEARER_TOKEN || 
                await getUserPluginAuthValue(userId, 'BEARER_TOKEN', true, pluginKey);
      } else {
        token = auth.token;
      }

      if (!token) {
        throw new Error('Bearer token not configured');
      }

      headers['Authorization'] = `Bearer ${token}`;
    } else if (auth.type === 'basic') {
      let username, password;
      
      if (auth.source === 'user') {
        username = customUserVars?.USERNAME || 
                   await getUserPluginAuthValue(userId, 'USERNAME', true, pluginKey);
        password = customUserVars?.PASSWORD || 
                   await getUserPluginAuthValue(userId, 'PASSWORD', true, pluginKey);
      } else {
        username = auth.username;
        password = auth.password;
      }

      if (!username || !password) {
        throw new Error('Basic auth credentials not configured');
      }

      const credentials = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (auth.type === 'oauth2') {
      // OAuth tokens are handled by MCP OAuth infrastructure
      // This will be retrieved from the token storage
      throw new Error('OAuth2 authentication should be handled by MCP OAuth flow');
    }
  }

  /**
   * Execute HTTP request
   * @param {Object} request - Request configuration
   * @returns {Promise<any>} Response data
   */
  async executeRequest(request) {
    try {
      logger.debug(`[APIToolExecutor] Executing ${request.method} ${request.url}`);

      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body && { body: request.body }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}\n${errorText}`,
        );
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('text/')) {
        return await response.text();
      } else {
        // Return as text for other content types
        return await response.text();
      }
    } catch (error) {
      logger.error('[APIToolExecutor] Request execution failed:', error);
      throw error;
    }
  }
}

module.exports = new APIToolExecutor();