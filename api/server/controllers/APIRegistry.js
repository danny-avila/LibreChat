const { logger } = require('@librechat/data-schemas');
const { Constants } = require('librechat-data-provider');
const OpenAPIParser = require('~/server/services/APIRegistry/OpenAPIParser');
const { getMCPServersRegistry } = require('~/config');

/**
 * Parse OpenAPI spec from URL
 * @route POST /api/registry/apis/parse
 */
const parseOpenAPISpec = async (req, res) => {
  try {
    const { swaggerUrl } = req.body;

    if (!swaggerUrl) {
      return res.status(400).json({ error: 'swaggerUrl is required' });
    }

    logger.info(`[APIRegistry] Parsing OpenAPI spec from: ${swaggerUrl}`);

    const parseResult = await OpenAPIParser.parseFromUrl(swaggerUrl);

    res.status(200).json({
      success: true,
      data: parseResult,
    });
  } catch (error) {
    logger.error('[APIRegistry] Error parsing OpenAPI spec:', error);
    res.status(500).json({
      error: 'Failed to parse OpenAPI specification',
      message: error.message,
    });
  }
};

/**
 * Create new API Registry entry
 * @route POST /api/registry/apis
 */
const createAPIRegistry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { swaggerUrl, title, description, selectedEndpoints, auth, customHeaders } = req.body;

    if (!swaggerUrl) {
      return res.status(400).json({ error: 'swaggerUrl is required' });
    }

    if (!selectedEndpoints || selectedEndpoints.length === 0) {
      return res.status(400).json({ error: 'At least one endpoint must be selected' });
    }

    logger.info(`[APIRegistry] Creating API registry for user ${userId}`);

    // Parse the OpenAPI spec
    const parseResult = await OpenAPIParser.parseFromUrl(swaggerUrl);

    // Generate server name from title
    const serverName = (title || parseResult.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Build API config
    const apiConfig = {
      swaggerUrl,
      baseUrl: parseResult.baseUrl,
      selectedEndpoints,
      endpoints: {},
      auth,
      customHeaders,
    };

    // Extract only selected endpoints
    for (const endpointKey of selectedEndpoints) {
      if (parseResult.endpoints[endpointKey]) {
        apiConfig.endpoints[endpointKey] = parseResult.endpoints[endpointKey];
      }
    }

    // Determine the URL to use for domain validation
    // Use the API's baseUrl if available, otherwise use the swagger URL's domain
    let serverUrl = parseResult.baseUrl;
    if (!serverUrl || serverUrl.startsWith('/')) {
      // If baseUrl is relative or empty, extract domain from swaggerUrl
      try {
        const swaggerUrlObj = new URL(swaggerUrl);
        serverUrl = `${swaggerUrlObj.protocol}//${swaggerUrlObj.host}`;
      } catch (e) {
        throw new Error('Could not determine API base URL. Please ensure the OpenAPI spec includes a valid server URL.');
      }
    }

    // Create MCP server config with API metadata
    const mcpConfig = {
      type: 'sse',
      url: serverUrl, // Use actual API base URL for domain validation
      title: title || parseResult.title,
      description: description || parseResult.description,
      startup: false, // Don't auto-initialize
      apiConfig,
    };

    // Add authentication config if provided
    if (auth) {
      if (auth.type === 'oauth2' && auth.oauth) {
        mcpConfig.oauth = {
          authorization_url: auth.oauth.authorizationUrl,
          token_url: auth.oauth.tokenUrl,
          client_id: auth.oauth.clientId,
          client_secret: auth.oauth.clientSecret,
          scope: auth.oauth.scopes?.join(' '),
        };
      } else if (auth.type === 'apiKey') {
        mcpConfig.apiKey = {
          source: auth.source,
          authorization_type: 'custom',
          custom_header: auth.headerName,
        };
        if (auth.source === 'user') {
          mcpConfig.customUserVars = {
            API_KEY: {
              title: `${title || parseResult.title} API Key`,
              description: 'Your API key for authentication',
            },
          };
        }
      } else if (auth.type === 'bearer') {
        mcpConfig.apiKey = {
          source: auth.source,
          authorization_type: 'bearer',
        };
        if (auth.source === 'user') {
          mcpConfig.customUserVars = {
            BEARER_TOKEN: {
              title: `${title || parseResult.title} Bearer Token`,
              description: 'Your bearer token for authentication',
            },
          };
        }
      }
    }

    // Save to registry (which stores in DB)
    const registry = getMCPServersRegistry();
    const result = await registry.addServer(serverName, mcpConfig, 'DB', userId, {
      sourceType: 'api',
    });

    logger.info(`[APIRegistry] Created API registry: ${serverName}`);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[APIRegistry] Error creating API registry:', error);
    res.status(500).json({
      error: 'Failed to create API registry',
      message: error.message,
    });
  }
};

/**
 * Get all API Registry entries for user
 * @route GET /api/registry/apis
 */
const getAPIRegistries = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`[APIRegistry] Fetching API registries for user ${userId}`);

    const registry = getMCPServersRegistry();
    const allServers = await registry.getAllServerConfigs(userId);

    // Filter only API-based servers
    const apiServers = Object.entries(allServers || {})
      .filter(([_, config]) => config.apiConfig)
      .map(([serverName, config]) => ({
        serverName,
        ...config,
      }));

    res.status(200).json({
      success: true,
      data: {
        apis: apiServers,
        total: apiServers.length,
      },
    });
  } catch (error) {
    logger.error('[APIRegistry] Error fetching API registries:', error);
    res.status(500).json({
      error: 'Failed to fetch API registries',
      message: error.message,
    });
  }
};

/**
 * Get single API Registry entry
 * @route GET /api/registry/apis/:serverName
 */
const getAPIRegistry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { serverName } = req.params;

    logger.info(`[APIRegistry] Fetching API registry: ${serverName}`);

    const registry = getMCPServersRegistry();
    const config = await registry.getServerConfig(serverName, userId);

    if (!config || !config.apiConfig) {
      return res.status(404).json({
        error: 'API registry not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        serverName,
        ...config,
      },
    });
  } catch (error) {
    logger.error('[APIRegistry] Error fetching API registry:', error);
    res.status(500).json({
      error: 'Failed to fetch API registry',
      message: error.message,
    });
  }
};

/**
 * Update API Registry entry
 * @route PATCH /api/registry/apis/:serverName
 */
const updateAPIRegistry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { serverName } = req.params;
    const { title, description, selectedEndpoints, auth, customHeaders } = req.body;

    logger.info(`[APIRegistry] Updating API registry: ${serverName}`);

    const registry = getMCPServersRegistry();
    const existingConfig = await registry.getServerConfig(serverName, userId);

    if (!existingConfig || !existingConfig.apiConfig) {
      return res.status(404).json({
        error: 'API registry not found',
      });
    }

    // Build updated config
    const updatedConfig = {
      ...existingConfig,
      ...(title && { title }),
      ...(description && { description }),
    };

    if (selectedEndpoints) {
      // Re-parse spec to get updated endpoint definitions
      const parseResult = await OpenAPIParser.parseFromUrl(existingConfig.apiConfig.swaggerUrl);
      
      updatedConfig.apiConfig = {
        ...existingConfig.apiConfig,
        selectedEndpoints,
        endpoints: {},
      };

      for (const endpointKey of selectedEndpoints) {
        if (parseResult.endpoints[endpointKey]) {
          updatedConfig.apiConfig.endpoints[endpointKey] = parseResult.endpoints[endpointKey];
        }
      }
    }

    if (auth) {
      updatedConfig.apiConfig.auth = auth;
      // Update MCP-level auth config
      if (auth.type === 'oauth2' && auth.oauth) {
        updatedConfig.oauth = {
          authorization_url: auth.oauth.authorizationUrl,
          token_url: auth.oauth.tokenUrl,
          client_id: auth.oauth.clientId,
          client_secret: auth.oauth.clientSecret,
          scope: auth.oauth.scopes?.join(' '),
        };
      }
    }

    if (customHeaders) {
      updatedConfig.apiConfig.customHeaders = customHeaders;
    }

    const result = await registry.updateServer(serverName, updatedConfig, 'DB', userId);

    logger.info(`[APIRegistry] Updated API registry: ${serverName}`);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[APIRegistry] Error updating API registry:', error);
    res.status(500).json({
      error: 'Failed to update API registry',
      message: error.message,
    });
  }
};

/**
 * Delete API Registry entry
 * @route DELETE /api/registry/apis/:serverName
 */
const deleteAPIRegistry = async (req, res) => {
  try {
    const userId = req.user.id;
    const { serverName } = req.params;

    logger.info(`[APIRegistry] Deleting API registry: ${serverName}`);

    const registry = getMCPServersRegistry();
    await registry.removeServer(serverName, 'DB', userId);

    logger.info(`[APIRegistry] Deleted API registry: ${serverName}`);

    res.status(200).json({
      success: true,
      message: 'API registry deleted successfully',
    });
  } catch (error) {
    logger.error('[APIRegistry] Error deleting API registry:', error);
    res.status(500).json({
      error: 'Failed to delete API registry',
      message: error.message,
    });
  }
};

/**
 * Get tools generated from API Registry
 * @route GET /api/registry/apis/:serverName/tools
 */
const getAPITools = async (req, res) => {
  try {
    const userId = req.user.id;
    const { serverName } = req.params;

    logger.info(`[APIRegistry] Fetching tools for API registry: ${serverName}`);

    const registry = getMCPServersRegistry();
    const config = await registry.getServerConfig(serverName, userId);

    if (!config || !config.apiConfig) {
      return res.status(404).json({
        error: 'API registry not found',
      });
    }

    // Generate tool definitions from selected endpoints
    const tools = [];
    for (const [endpointKey, endpoint] of Object.entries(config.apiConfig.endpoints || {})) {
      const toolDef = OpenAPIParser.endpointToToolDefinition(serverName, endpointKey, endpoint);
      tools.push(toolDef);
    }

    res.status(200).json({
      success: true,
      data: {
        serverName,
        tools,
        total: tools.length,
      },
    });
  } catch (error) {
    logger.error('[APIRegistry] Error fetching API tools:', error);
    res.status(500).json({
      error: 'Failed to fetch API tools',
      message: error.message,
    });
  }
};

module.exports = {
  parseOpenAPISpec,
  createAPIRegistry,
  getAPIRegistries,
  getAPIRegistry,
  updateAPIRegistry,
  deleteAPIRegistry,
  getAPITools,
};