import { Request, Response } from 'express';
import { logger } from '@librechat/data-schemas';

interface MCPCreateRequest extends Request {
  body: {
    name: string;
    description: string;
    url: string;
    icon?: string;
    tools?: string[];
    trust: boolean;
    customHeaders?: Array<{
      id: string;
      name: string;
      value: string;
    }>;
    requestTimeout?: number;
    connectionTimeout?: number;
  };
  user?: {
    id: string;
  };
}

export interface MCPCreateResponse {
  mcp_id: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icon?: string;
    tools?: string[];
    trust: boolean;
    customHeaders?: Array<{
      id: string;
      name: string;
      value: string;
    }>;
    requestTimeout?: number;
    connectionTimeout?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface MCPCreateError {
  error: string;
  message?: string;
}

/**
 * Add a new tool/MCP to the system
 * @route POST /agents/tools/add
 * @param {object} req.body - Request body containing tool/MCP data
 * @param {string} req.body.name - Tool/MCP name
 * @param {string} req.body.description - Tool/MCP description
 * @param {string} req.body.url - Tool/MCP server URL
 * @param {string} [req.body.icon] - Tool/MCP icon (base64)
 * @param {string[]} [req.body.tools] - Available tools
 * @param {boolean} req.body.trust - Trust flag
 * @param {string[]} [req.body.customHeaders] - Custom headers
 * @param {string} [req.body.requestTimeout] - Request timeout
 * @param {string} [req.body.connectionTimeout] - Connection timeout
 * @returns {object} Created tool/MCP object
 */
export const addTool = async (req: MCPCreateRequest, res: Response) => {
  try {
    const {
      name,
      description,
      url,
      icon,
      tools,
      trust,
      customHeaders,
      requestTimeout,
      connectionTimeout,
    } = req.body;

    // Log the raw request body for debugging
    logger.info('Raw request body: ' + JSON.stringify(req.body, null, 2));

    // Log the incoming tool/MCP request for development
    const logData = {
      name,
      description,
      url,
      icon: icon ? 'base64_icon_provided' : 'no_icon',
      tools: tools || [],
      trust,
      customHeaders: customHeaders || [],
      timeouts: {
        requestTimeout: requestTimeout || 'default',
        connectionTimeout: connectionTimeout || 'default',
      },
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    };

    logger.info('Add Tool/MCP Request: ' + JSON.stringify(logData, null, 2));

    // Validate required fields
    if (!name || !description || !url) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, and url are required',
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL format',
      });
    }

    // Validate trust flag
    if (typeof trust !== 'boolean') {
      return res.status(400).json({
        error: 'Trust flag must be a boolean value',
      });
    }

    // For now, return a mock successful response
    // TODO: Implement actual tool/MCP creation logic
    const mockTool = {
      mcp_id: `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        name,
        description,
        url,
        icon: icon || undefined,
        tools: tools || [],
        trust,
        customHeaders: customHeaders || [],
        requestTimeout,
        connectionTimeout,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    logger.info('Tool/MCP created successfully:', JSON.stringify(mockTool, null, 2));

    res.status(201).json(mockTool);
  } catch (error) {
    logger.error('Error adding tool/MCP:', error);
    res.status(500).json({
      error: 'Internal server error while adding tool/MCP',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
