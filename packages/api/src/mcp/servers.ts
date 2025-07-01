import { logger } from '@librechat/data-schemas';
import type { MCP } from 'librechat-data-provider';
import type { Response } from 'express';
import type { AuthenticatedRequest, MCPRequest, MCPParamsRequest } from '../types';

// Mock data for demonstration
const mockMCPServers: MCP[] = [
  {
    mcp_id: 'mcp_weather_001',
    metadata: {
      name: 'Weather Service',
      description: 'Provides weather information and forecasts',
      url: 'https://weather-mcp.example.com',
      tools: ['get_current_weather', 'get_forecast', 'get_weather_alerts'],
      icon: '',
      trust: true,
      customHeaders: [],
      requestTimeout: 30000,
      connectionTimeout: 10000,
    },
    agent_id: '',
  },
  {
    mcp_id: 'mcp_calendar_002',
    metadata: {
      name: 'Calendar Manager',
      description: 'Manages calendar events and scheduling',
      url: 'https://calendar-mcp.example.com',
      tools: ['create_event', 'list_events', 'update_event', 'delete_event'],
      icon: '',
      trust: false,
      customHeaders: [{ id: '1', name: 'Authorization', value: 'Bearer {{api_key}}' }],
      requestTimeout: 45000,
      connectionTimeout: 15000,
    },
    agent_id: '',
  },
];

/**
 * Get all MCP servers for the authenticated user
 */
export const getMCPServers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.warn('MCP servers fetch without user ID');
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    // Return mock MCP servers
    res.json(mockMCPServers);
  } catch (error) {
    logger.error('Error fetching MCP servers:', error);
    res.status(500).json({ message: 'Failed to fetch MCP servers' });
  }
};

/**
 * Get a single MCP server by ID
 */
export const getMCPServer = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { mcp_id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      logger.warn('MCP server fetch without user ID');
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    if (!mcp_id) {
      logger.warn('MCP server fetch with missing mcp_id');
      res.status(400).json({ message: 'Missing required parameter: mcp_id' });
      return;
    }

    // Find the MCP server
    const server = mockMCPServers.find((s) => s.mcp_id === mcp_id);

    if (!server) {
      logger.warn(`MCP server ${mcp_id} not found for user ${userId}`);
      res.status(404).json({ message: 'MCP server not found' });
      return;
    }

    res.json(server);
  } catch (error) {
    logger.error('Error fetching MCP server:', error);
    res.status(500).json({ message: 'Failed to fetch MCP server' });
  }
};

/**
 * Create a new MCP server
 */
export const createMCPServer = async (req: MCPRequest, res: Response): Promise<void> => {
  try {
    const { body: formData } = req;
    const userId = req.user?.id;

    if (!userId) {
      logger.warn('MCP server creation without user ID');
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    // Validate required fields
    if (!formData?.metadata?.name || !formData?.metadata?.url) {
      logger.warn('MCP server creation with missing required fields');
      res.status(400).json({
        message: 'Missing required fields: name and url are required',
      });
      return;
    }

    // Check if server already exists
    const serverExists = mockMCPServers.some(
      (server) => server.metadata.name === formData.metadata.name,
    );

    if (serverExists) {
      logger.warn(`MCP server ${formData.metadata.name} already exists for user ${userId}`);
      res.status(409).json({ message: 'MCP server already exists' });
      return;
    }

    // Create new MCP server from form data
    const newMCPServer: MCP = {
      mcp_id: formData.mcp_id || `mcp_${Date.now()}`,
      metadata: {
        name: formData.metadata.name,
        description: formData.metadata.description || '',
        url: formData.metadata.url,
        tools: formData.metadata.tools || [],
        icon: formData.metadata.icon || '🔧',
        trust: formData.metadata.trust || false,
        customHeaders: formData.metadata.customHeaders || [],
        requestTimeout: formData.metadata.requestTimeout || 30000,
        connectionTimeout: formData.metadata.connectionTimeout || 10000,
      },
      agent_id: formData.agent_id || '',
    };

    logger.info(`Created MCP server: ${newMCPServer.mcp_id} for user ${userId}`);

    res.status(201).json(newMCPServer);
  } catch (error) {
    logger.error('Error creating MCP server:', error);
    res.status(500).json({ message: 'Failed to create MCP server' });
  }
};

/**
 * Update an existing MCP server
 */
export const updateMCPServer = async (req: MCPParamsRequest, res: Response): Promise<void> => {
  try {
    const {
      body: formData,
      params: { mcp_id },
    } = req;
    const userId = req.user?.id;

    if (!userId) {
      logger.warn('MCP server update without user ID');
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    // Validate required fields
    if (!formData?.metadata?.name || !formData?.metadata?.url) {
      logger.warn('MCP server update with missing required fields');
      res.status(400).json({
        message: 'Missing required fields: name and url are required',
      });
      return;
    }

    if (!mcp_id) {
      logger.warn('MCP server update with missing mcp_id');
      res.status(400).json({ message: 'Missing required parameter: mcp_id' });
      return;
    }

    // Check if server exists
    const existingServer = mockMCPServers.find((server) => server.mcp_id === mcp_id);

    if (!existingServer) {
      logger.warn(`MCP server ${mcp_id} not found for update for user ${userId}`);
      res.status(404).json({ message: 'MCP server not found' });
      return;
    }

    // Create updated MCP server from form data
    const updatedMCP: MCP = {
      mcp_id,
      metadata: {
        name: formData.metadata.name,
        description: formData.metadata.description || existingServer.metadata.description || '',
        url: formData.metadata.url,
        tools: formData.metadata.tools || existingServer.metadata.tools || [],
        icon: formData.metadata.icon || existingServer.metadata.icon || '🔧',
        trust:
          formData.metadata.trust !== undefined
            ? formData.metadata.trust
            : existingServer.metadata.trust || false,
        customHeaders:
          formData.metadata.customHeaders || existingServer.metadata.customHeaders || [],
        requestTimeout:
          formData.metadata.requestTimeout || existingServer.metadata.requestTimeout || 30000,
        connectionTimeout:
          formData.metadata.connectionTimeout || existingServer.metadata.connectionTimeout || 10000,
      },
      agent_id: formData.agent_id || existingServer.agent_id || '',
    };

    // In a real implementation, you would update this in a database
    logger.info(`Updated MCP server: ${mcp_id} for user ${userId}`);

    res.json(updatedMCP);
  } catch (error) {
    logger.error('Error updating MCP server:', error);
    res.status(500).json({ message: 'Failed to update MCP server' });
  }
};

/**
 * Delete an MCP server
 */
export const deleteMCPServer = async (req: MCPParamsRequest, res: Response): Promise<void> => {
  try {
    const {
      params: { mcp_id },
    } = req;
    const userId = req.user?.id;

    if (!userId) {
      logger.warn('MCP server deletion without user ID');
      res.status(401).json({ message: 'User not authenticated' });
      return;
    }

    if (!mcp_id) {
      logger.warn('MCP server deletion with missing mcp_id');
      res.status(400).json({ message: 'Missing required parameter: mcp_id' });
      return;
    }

    // Check if server exists
    const serverExists = mockMCPServers.some((server) => server.mcp_id === mcp_id);

    if (!serverExists) {
      logger.warn(`MCP server ${mcp_id} not found for deletion for user ${userId}`);
      res.status(404).json({ message: 'MCP server not found' });
      return;
    }

    // In a real implementation, you would delete this from a database
    logger.info(`Deleted MCP server: ${mcp_id} for user ${userId}`);

    res.json({ message: 'MCP server deleted successfully' });
  } catch (error) {
    logger.error('Error deleting MCP server:', error);
    res.status(500).json({ message: 'Failed to delete MCP server' });
  }
};
