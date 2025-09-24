const express = require('express');
const { 
  getA2AAgents,
  registerA2AAgent,
  unregisterA2AAgent,
  getA2AAgent,
} = require('../controllers/a2a/chat');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const discoveryService = require('../services/A2ADiscoveryService');

const router = express.Router();

/**
 * A2A Routes for External Agent Communication
 * These routes handle communication with external A2A protocol agents
 */

// Middleware to ensure A2A service is running
router.use((req, res, next) => {
  if (!discoveryService.isRunning) {
    discoveryService.start();
  }
  next();
});

/**
 * Chat with A2A agent
 * POST /api/a2a/chat
 * 
 * Body:
 * - agentId: string (required) - A2A agent identifier
 * - message: string (required) - Message to send
 * - conversationId: string (optional) - Conversation context ID
 * - taskBased: boolean (optional, default: false) - Use task-based workflow
 * - streaming: boolean (optional, default: true) - Enable streaming response
 */
// router.post('/chat', requireJwtAuth, handleA2AChat);

/**
 * Get all registered A2A agents
 * GET /api/a2a/agents
 * 
 * Query parameters:
 * - status: string (optional) - Filter by agent status (online, offline, error)
 * - capability: string (optional) - Filter by capability (streaming, taskBased, etc.)
 */
router.get('/agents', requireJwtAuth, (req, res, next) => {
  const { status, capability } = req.query;
  
  // Add filtering logic if query parameters provided
  req.filterOptions = { status, capability };
  
  getA2AAgents(req, res, next);
});

/**
 * Register new A2A agent
 * POST /api/a2a/agents/register
 * 
 * Body:
 * - agentCardUrl: string (required) - URL to A2A agent card
 * - authentication: object (optional) - Authentication configuration
 *   - type: 'none' | 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls'
 *   - credentials: object (optional) - Authentication credentials
 *   - headers: object (optional) - Custom headers
 * - options: object (optional) - Additional configuration
 *   - timeout: number (optional, default: 30000) - Request timeout in ms
 *   - maxRetries: number (optional, default: 3) - Maximum retry attempts
 *   - enableStreaming: boolean (optional, default: true) - Enable streaming
 *   - enableTasks: boolean (optional, default: true) - Enable task-based workflows
 */
router.post('/agents/register', requireJwtAuth, registerA2AAgent);

/**
 * Get specific A2A agent details
 * GET /api/a2a/agents/:agentId
 */
router.get('/agents/:agentId', requireJwtAuth, getA2AAgent);

/**
 * Unregister A2A agent
 * DELETE /api/a2a/agents/:agentId
 */
router.delete('/agents/:agentId', requireJwtAuth, unregisterA2AAgent);

/**
 * Refresh A2A agent card
 * POST /api/a2a/agents/:agentId/refresh
 */
router.post('/agents/:agentId/refresh', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    await discoveryService.refreshAgentCard(agentId);
    
    res.json({ 
      success: true,
      message: `Agent card refreshed for ${agentId}` 
    });
  } catch (error) {
    console.error('Error refreshing agent card:', error);
    res.status(500).json({ 
      error: 'Failed to refresh agent card',
      message: error.message 
    });
  }
});

/**
 * Perform health check for specific agent
 * POST /api/a2a/agents/:agentId/health
 */
router.post('/agents/:agentId/health', requireJwtAuth, async (req, res) => {
  try {
    const { agentId } = req.params;
    
    await discoveryService.performHealthCheck(agentId);
    const agent = discoveryService.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ 
        error: `A2A agent not found: ${agentId}` 
      });
    }
    
    res.json({ 
      agentId,
      status: agent.status,
      lastHealthCheck: agent.lastHealthCheck,
    });
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({ 
      error: 'Failed to perform health check',
      message: error.message 
    });
  }
});

/**
 * Perform health checks for all agents
 * POST /api/a2a/health
 */
router.post('/health', requireJwtAuth, async (req, res) => {
  try {
    await discoveryService.performHealthChecks();
    
    const agents = discoveryService.getRegisteredAgents();
    const healthSummary = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      lastHealthCheck: agent.lastHealthCheck,
    }));
    
    res.json({ 
      success: true,
      timestamp: new Date(),
      agents: healthSummary,
    });
  } catch (error) {
    console.error('Error performing health checks:', error);
    res.status(500).json({ 
      error: 'Failed to perform health checks',
      message: error.message 
    });
  }
});

/**
 * Get agents by capability
 * GET /api/a2a/agents/by-capability/:capability
 * 
 * Supported capabilities: streaming, push, multiTurn, taskBased, tools
 */
router.get('/agents/by-capability/:capability', requireJwtAuth, (req, res) => {
  try {
    const { capability } = req.params;
    
    const agents = discoveryService.getAgentsByCapability(capability);
    
    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      capabilities: agent.agentCard?.capabilities || {},
      skills: agent.agentCard?.skills || [],
    }));
    
    res.json({ 
      capability,
      agents: formattedAgents 
    });
  } catch (error) {
    console.error('Error fetching agents by capability:', error);
    res.status(500).json({ 
      error: 'Failed to fetch agents by capability',
      message: error.message 
    });
  }
});

/**
 * Get online agents only
 * GET /api/a2a/agents/online
 */
router.get('/agents/online', requireJwtAuth, (req, res) => {
  try {
    const agents = discoveryService.getOnlineAgents();
    
    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      capabilities: agent.agentCard?.capabilities || {},
      skills: agent.agentCard?.skills || [],
      lastHealthCheck: agent.lastHealthCheck,
    }));
    
    res.json({ agents: formattedAgents });
  } catch (error) {
    console.error('Error fetching online agents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch online agents',
      message: error.message 
    });
  }
});

/**
 * Discover agent at URL (without registering)
 * POST /api/a2a/discover
 * 
 * Body:
 * - agentCardUrl: string (required) - URL to A2A agent card
 */
router.post('/discover', requireJwtAuth, async (req, res) => {
  try {
    const { agentCardUrl } = req.body;
    
    if (!agentCardUrl) {
      return res.status(400).json({ 
        error: 'Missing required parameter: agentCardUrl' 
      });
    }
    
    const agentCard = await discoveryService.discoverAgent(agentCardUrl);
    
    res.json({ 
      success: true,
      agentCard,
    });
  } catch (error) {
    console.error('Error discovering agent:', error);
    res.status(500).json({ 
      error: 'Failed to discover agent',
      message: error.message 
    });
  }
});

/**
 * Get task status for a specific task
 * GET /api/a2a/tasks/:taskId/status
 */
router.get('/tasks/:taskId/status', requireJwtAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Get the A2A client for the agent
    const client = discoveryService.getClient(agentId);
    if (!client) {
      return res.status(404).json({ error: `A2A client not found for agent: ${agentId}` });
    }

    // Get task status
    const taskStatus = await client.getTaskStatus(taskId);
    
    console.log(`Task status retrieved: ${taskId} -> ${taskStatus.status}`);

    res.json({
      success: true,
      task: taskStatus,
    });

  } catch (error) {
    console.error(`Error getting task status for ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to get task status',
      message: error.message,
    });
  }
});

/**
 * Cancel a task
 * DELETE /api/a2a/tasks/:taskId
 */
router.delete('/tasks/:taskId', requireJwtAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { agentId } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    // Get the A2A client for the agent
    const client = discoveryService.getClient(agentId);
    if (!client) {
      return res.status(404).json({ error: `A2A client not found for agent: ${agentId}` });
    }

    // Cancel the task
    const result = await client.cancelTask(taskId);
    
    console.log(`Task cancelled: ${taskId}`);

    res.json({
      success: true,
      result: result,
    });

  } catch (error) {
    console.error(`Error cancelling task ${req.params.taskId}:`, error);
    res.status(500).json({
      error: 'Failed to cancel task',
      message: error.message,
    });
  }
});

/**
 * Get active tasks for a conversation
 * GET /api/a2a/conversations/:conversationId/tasks
 */
router.get('/conversations/:conversationId/tasks', requireJwtAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId || conversationId === 'new') {
      return res.json({
        success: true,
        tasks: [],
      });
    }

    // Get conversation to check for active tasks
    const { getConvoById } = require('~/models');
    const conversation = await getConvoById(req, conversationId);

    if (!conversation?.metadata?.activeTaskId) {
      return res.json({
        success: true,
        tasks: [],
      });
    }

    const taskId = conversation.metadata.activeTaskId;
    const agentId = conversation.metadata.agentId;

    if (!agentId) {
      console.warn(`No agent ID found in conversation metadata: ${conversationId}`);
      return res.json({
        success: true,
        tasks: [],
      });
    }

    // Get the A2A client for the agent
    const client = discoveryService.getClient(agentId);
    if (!client) {
      console.warn(`A2A client not found for agent: ${agentId}`);
      return res.json({
        success: true,
        tasks: [],
      });
    }

    // Get current task status
    try {
      const taskStatus = await client.getTaskStatus(taskId);
      
      res.json({
        success: true,
        tasks: [{
          id: taskId,
          agentId: agentId,
          status: taskStatus.status,
          statusMessage: taskStatus.statusMessage,
          lastUpdate: conversation.metadata.lastTaskUpdate,
          artifacts: taskStatus.artifacts || [],
        }],
      });

    } catch (taskError) {
      // Task might not exist anymore, return empty array
      console.warn(`Task ${taskId} not found:`, taskError.message);
      res.json({
        success: true,
        tasks: [],
      });
    }

  } catch (error) {
    console.error(`Error getting tasks for conversation ${req.params.conversationId}:`, error);
    res.status(500).json({
      error: 'Failed to get conversation tasks',
      message: error.message,
    });
  }
});

/**
 * A2A service status
 * GET /api/a2a/status
 */
router.get('/status', requireJwtAuth, (req, res) => {
  try {
    const agents = discoveryService.getRegisteredAgents();
    const onlineAgents = discoveryService.getOnlineAgents();
    
    res.json({
      service: {
        running: discoveryService.isRunning,
        healthCheckInterval: discoveryService.healthCheckInterval,
      },
      agents: {
        total: agents.length,
        online: onlineAgents.length,
        offline: agents.filter(a => a.status === 'offline').length,
        error: agents.filter(a => a.status === 'error').length,
        unknown: agents.filter(a => a.status === 'unknown').length,
      },
      lastHealthCheck: agents.length > 0 ? 
        Math.max(...agents.map(a => new Date(a.lastHealthCheck || 0).getTime())) : 
        null,
    });
  } catch (error) {
    console.error('Error getting A2A status:', error);
    res.status(500).json({ 
      error: 'Failed to get A2A status',
      message: error.message 
    });
  }
});

/**
 * Error handling middleware for A2A routes
 */
router.use((error, req, res, next) => {
  console.error('A2A Route Error:', error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  res.status(500).json({
    error: 'A2A service error',
    message: error.message || 'Unknown error occurred',
    path: req.path,
  });
});

module.exports = router;