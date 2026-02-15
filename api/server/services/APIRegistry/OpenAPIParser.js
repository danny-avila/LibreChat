const { logger } = require('@librechat/data-schemas');

/**
 * OpenAPI/Swagger Parser Service
 * Parses OpenAPI 3.x and Swagger 2.x specifications
 */
class OpenAPIParser {
  /**
   * Fetch and parse OpenAPI spec from URL
   * @param {string} swaggerUrl - URL to OpenAPI/Swagger spec
   * @returns {Promise<import('librechat-data-provider').OpenAPIParseResult>}
   */
  async parseFromUrl(swaggerUrl) {
    try {
      logger.info(`[OpenAPIParser] Fetching spec from: ${swaggerUrl}`);
      
      const response = await fetch(swaggerUrl, {
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let spec;

      if (contentType.includes('yaml') || contentType.includes('yml') || swaggerUrl.endsWith('.yaml') || swaggerUrl.endsWith('.yml')) {
        // Parse YAML
        const yaml = require('js-yaml');
        const text = await response.text();
        spec = yaml.load(text);
      } else {
        // Parse JSON
        spec = await response.json();
      }

      return this.parseSpec(spec);
    } catch (error) {
      logger.error('[OpenAPIParser] Error fetching/parsing spec:', error);
      throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
    }
  }

  /**
   * Parse OpenAPI spec object
   * @param {object} spec - OpenAPI specification object
   * @returns {import('librechat-data-provider').OpenAPIParseResult}
   */
  parseSpec(spec) {
    // Detect OpenAPI version
    const version = spec.openapi || spec.swagger || 'unknown';
    const isOpenAPI3 = version.startsWith('3.');
    const isSwagger2 = version.startsWith('2.');

    if (!isOpenAPI3 && !isSwagger2) {
      throw new Error(`Unsupported OpenAPI version: ${version}`);
    }

    logger.info(`[OpenAPIParser] Parsing ${isOpenAPI3 ? 'OpenAPI 3.x' : 'Swagger 2.x'} spec`);

    // Extract basic info
    const title = spec.info?.title || 'Unnamed API';
    const description = spec.info?.description;

    // Extract base URL
    const baseUrl = this.extractBaseUrl(spec, isOpenAPI3);

    // Extract authentication schemes
    const authSchemes = this.extractAuthSchemes(spec, isOpenAPI3);

    // Extract endpoints
    const endpoints = this.extractEndpoints(spec, isOpenAPI3);

    return {
      title,
      description,
      baseUrl,
      authSchemes,
      endpoints,
      version,
    };
  }

  /**
   * Extract base URL from spec
   * @param {object} spec - OpenAPI spec
   * @param {boolean} isOpenAPI3 - Whether this is OpenAPI 3.x
   * @returns {string}
   */
  extractBaseUrl(spec, isOpenAPI3) {
    if (isOpenAPI3) {
      // OpenAPI 3.x uses servers array
      const server = spec.servers?.[0];
      if (server?.url) {
        // Handle relative URLs by converting to absolute
        const url = server.url;
        // If URL starts with /, it's relative - we can't determine the full URL
        // Return it as-is and let the user configure it
        if (url.startsWith('/')) {
          logger.warn(`[OpenAPIParser] Relative server URL found: ${url}. User must provide base URL.`);
          return url;
        }
        return url;
      }
    } else {
      // Swagger 2.x uses host + basePath + schemes
      const scheme = spec.schemes?.[0] || 'https';
      const host = spec.host || '';
      const basePath = spec.basePath || '';
      if (host) {
        return `${scheme}://${host}${basePath}`;
      }
    }

    // Return empty string instead of throwing - let validation handle it
    logger.warn('[OpenAPIParser] Could not determine base URL from OpenAPI spec');
    return '';
  }

  /**
   * Extract authentication schemes
   * @param {object} spec - OpenAPI spec
   * @param {boolean} isOpenAPI3 - Whether this is OpenAPI 3.x
   * @returns {Array}
   */
  extractAuthSchemes(spec, isOpenAPI3) {
    const schemes = [];
    const securitySchemes = isOpenAPI3
      ? spec.components?.securitySchemes
      : spec.securityDefinitions;

    if (!securitySchemes) {
      return schemes;
    }

    for (const [name, scheme] of Object.entries(securitySchemes)) {
      schemes.push({
        name,
        type: scheme.type,
        scheme: scheme.scheme,
        in: scheme.in,
        bearerFormat: scheme.bearerFormat,
      });
    }

    return schemes;
  }

  /**
   * Extract all endpoints from spec
   * @param {object} spec - OpenAPI spec
   * @param {boolean} isOpenAPI3 - Whether this is OpenAPI 3.x
   * @returns {Record<string, import('librechat-data-provider').OpenAPIEndpoint>}
   */
  extractEndpoints(spec, isOpenAPI3) {
    const endpoints = {};
    const paths = spec.paths || {};

    for (const [path, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete'];

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) {
          continue;
        }

        const key = `${method.toUpperCase()} ${path}`;
        endpoints[key] = {
          method: method.toUpperCase(),
          path,
          operationId: operation.operationId || this.generateOperationId(method, path),
          summary: operation.summary,
          description: operation.description,
          parameters: this.extractParameters(operation, pathItem, isOpenAPI3),
          requestBody: this.extractRequestBody(operation, isOpenAPI3),
          responses: operation.responses,
        };
      }
    }

    return endpoints;
  }

  /**
   * Extract parameters from operation
   * @param {object} operation - Operation object
   * @param {object} pathItem - Path item object (for shared parameters)
   * @param {boolean} isOpenAPI3 - Whether this is OpenAPI 3.x
   * @returns {Array}
   */
  extractParameters(operation, pathItem, isOpenAPI3) {
    const params = [];
    
    // Combine path-level and operation-level parameters
    const allParams = [
      ...(pathItem.parameters || []),
      ...(operation.parameters || []),
    ];

    for (const param of allParams) {
      // Dereference if needed
      const resolvedParam = param.$ref ? this.resolveRef(param.$ref) : param;

      params.push({
        name: resolvedParam.name,
        in: resolvedParam.in,
        required: resolvedParam.required || resolvedParam.in === 'path',
        schema: isOpenAPI3 ? resolvedParam.schema : { type: resolvedParam.type },
        description: resolvedParam.description,
      });
    }

    return params;
  }

  /**
   * Extract request body from operation (OpenAPI 3.x only)
   * @param {object} operation - Operation object
   * @param {boolean} isOpenAPI3 - Whether this is OpenAPI 3.x
   * @returns {object|undefined}
   */
  extractRequestBody(operation, isOpenAPI3) {
    if (!isOpenAPI3 || !operation.requestBody) {
      return undefined;
    }

    return {
      required: operation.requestBody.required,
      content: operation.requestBody.content,
    };
  }

  /**
   * Generate operation ID from method and path
   * @param {string} method - HTTP method
   * @param {string} path - Endpoint path
   * @returns {string}
   */
  generateOperationId(method, path) {
    // Convert /users/{id}/posts to users_id_posts
    const pathPart = path
      .replace(/^\//, '')
      .replace(/\//g, '_')
      .replace(/[{}]/g, '')
      .replace(/-/g, '_');
    
    return `${method}_${pathPart}`;
  }

  /**
   * Resolve $ref reference (basic implementation)
   * @param {string} ref - Reference string
   * @returns {object}
   */
  resolveRef(ref) {
    // TODO: Implement full $ref resolution
    // For now, return empty object
    logger.warn(`[OpenAPIParser] $ref resolution not fully implemented: ${ref}`);
    return {};
  }

  /**
   * Convert OpenAPI endpoint to MCP tool definition
   * @param {string} apiId - API Registry ID
   * @param {string} endpointKey - Endpoint key (e.g., "POST /users")
   * @param {import('librechat-data-provider').OpenAPIEndpoint} endpoint - Endpoint definition
   * @returns {import('librechat-data-provider').APIToolDefinition}
   */
  endpointToToolDefinition(apiId, endpointKey, endpoint) {
    const toolName = this.generateToolName(apiId, endpoint.operationId);
    const description = endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`;

    // Build input schema from parameters and request body
    const properties = {};
    const required = [];

    // Add path and query parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        properties[param.name] = {
          ...param.schema,
          description: param.description,
        };
        if (param.required) {
          required.push(param.name);
        }
      }
    }

    // Add request body properties
    if (endpoint.requestBody?.content?.['application/json']?.schema) {
      const bodySchema = endpoint.requestBody.content['application/json'].schema;
      if (bodySchema.properties) {
        Object.assign(properties, bodySchema.properties);
        if (bodySchema.required) {
          required.push(...bodySchema.required);
        }
      }
    }

    return {
      name: toolName,
      description,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
      },
      metadata: {
        apiId,
        method: endpoint.method,
        path: endpoint.path,
        operationId: endpoint.operationId,
      },
    };
  }

  /**
   * Generate tool name from API ID and operation ID
   * @param {string} apiId - API Registry ID
   * @param {string} operationId - Operation ID
   * @returns {string}
   */
  generateToolName(apiId, operationId) {
    // Sanitize and combine: github_api_create_issue
    const sanitizedApiId = apiId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const sanitizedOpId = operationId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${sanitizedApiId}_${sanitizedOpId}`;
  }
}

module.exports = new OpenAPIParser();