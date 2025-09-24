const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('@librechat/api');
const { saveMessage, saveConvo } = require('~/models');
const discoveryService = require('../../services/A2ADiscoveryService');

/**
 * Poll for task completion and stream updates
 */
const pollTaskCompletion = async (client, taskId, agent, contextId, messageId, res, streaming, req) => {
  const maxPolls = 60; // Maximum 5 minutes (60 * 5s)
  let pollCount = 0;
  
  const poll = async () => {
    try {
      if (pollCount >= maxPolls) {
        throw new Error('Task polling timeout');
      }
      
      const taskStatus = await client.getTaskStatus(taskId);
      pollCount++;
      
      // Send status update
      if (streaming) {
        sendEvent(res, {
          type: 'task_update',
          taskId,
          status: taskStatus.status,
          statusMessage: taskStatus.statusMessage,
          pollCount,
        });
      }
      
      // Check if task is complete
      const terminalStates = ['completed', 'failed', 'canceled'];
      if (terminalStates.includes(taskStatus.status)) {
        return handleTaskCompletion(taskStatus, agent, contextId, messageId, res, streaming, req);
      }
      
      // Continue polling
      setTimeout(poll, 5000); // Poll every 5 seconds
      
    } catch (error) {
      console.error(`Task polling error for ${taskId}:`, error);
      throw error;
    }
  };
  
  // Start polling
  setTimeout(poll, 2000); // Initial delay of 2 seconds
};

/**
 * Handle task completion
 */
const handleTaskCompletion = async (taskStatus, agent, contextId, messageId, res, streaming, req) => {
  const responseMessageId = uuidv4();
  
  // Extract response content from task
  let responseText = 'Task completed';
  if (taskStatus.history && taskStatus.history.length > 0) {
    const lastMessage = taskStatus.history[taskStatus.history.length - 1];
    if (lastMessage.role === 'agent' && lastMessage.parts?.[0]?.content) {
      responseText = lastMessage.parts[0].content;
    }
  }
  
  // Stream response content if available
  if (streaming && responseText !== 'Task completed') {
    await streamContent(responseText, res, responseMessageId);
  }
  
  // Send final response using LibreChat's expected format
  const finalResponse = {
    final: true,
    conversation: {
      conversationId: contextId,
      title: `A2A Task with ${agent.name}`,
    },
    requestMessage: {
      messageId,
      conversationId: contextId,
      parentMessageId: null,
      role: 'user',
      text: message,
    },
    responseMessage: {
      messageId: responseMessageId,
      conversationId: contextId,
      parentMessageId: messageId,
      role: 'assistant',
      text: responseText,
      model: `a2a-${agent.id}`,
      endpoint: 'a2a',
      metadata: {
        agentId: agent.id,
        agentName: agent.name,
        taskId: taskStatus.id,
        taskStatus: taskStatus.status,
        artifacts: taskStatus.artifacts || [],
      },
    },
  };

  if (streaming) {
    sendEvent(res, finalResponse);
    
    // Save messages to database after successful task completion
    try {
      // Save user message
      await saveMessage(req, {
        messageId,
        conversationId: contextId,
        parentMessageId: null,
        role: 'user',
        text: finalResponse.requestMessage.text,
        user: req.user?.id,
        endpoint: 'a2a',
        model: `a2a-${agent.id}`,
        isCreatedByUser: true,
      }, { context: 'A2A Task Chat - User Message' });

      // Save agent response
      const agentMessage = await saveMessage(req, {
        messageId: responseMessageId,
        conversationId: contextId,
        parentMessageId: messageId,
        role: 'assistant',
        text: responseText,
        user: req.user?.id,
        endpoint: 'a2a',
        model: `a2a-${agent.id}`,
        metadata: {
          agentId: agent.id,
          agentName: agent.name,
          taskId: taskStatus.id,
          taskStatus: taskStatus.status,
          artifacts: taskStatus.artifacts || [],
        },
      }, { context: 'A2A Task Chat - Agent Response' });

      // Save conversation metadata
      await saveConvo(req, {
        conversationId: contextId,
        endpoint: 'a2a',
        model: `a2a-${agent.id}`,
        title: `A2A Task with ${agent.name}`,
      }, { context: 'A2A Task Chat - Conversation' });
      
    } catch (saveError) {
      console.error('Error saving A2A task messages:', saveError);
      // Don't fail the request if saving fails
    }
  }
  
  return finalResponse;
};

/**
 * Stream content in chunks using LibreChat's expected format
 */
const streamContent = async (content, res, messageId) => {
  const words = content.split(' ');
  const chunkSize = 3; // Stream 3 words at a time
  let accumulatedText = '';
  
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    accumulatedText += (i === 0 ? chunk : ' ' + chunk);
    
    // Use LibreChat's expected streaming format
    sendEvent(res, {
      message: true,
      initial: i === 0,
      messageId,
      text: accumulatedText,
    });
    
    // Add delay to simulate typing
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

/**
 * Get available A2A agents
 */
const getA2AAgents = async (req, res) => {
  try {
    const agents = discoveryService.getRegisteredAgents();
    
    // Format agents for client consumption
    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      capabilities: agent.agentCard?.capabilities || {},
      skills: agent.agentCard?.skills || [],
      transport: agent.preferredTransport,
      lastHealthCheck: agent.lastHealthCheck,
      createdAt: agent.createdAt,
    }));
    
    res.json({ agents: formattedAgents });
    
  } catch (error) {
    console.error('Error fetching A2A agents:', error);
    res.status(500).json({ 
      error: 'Failed to fetch A2A agents',
      message: error.message 
    });
  }
};

/**
 * Register a new A2A agent
 */
const registerA2AAgent = async (req, res) => {
  try {
    const { agentCardUrl, authentication = { type: 'none' }, options = {} } = req.body;
    
    if (!agentCardUrl) {
      return res.status(400).json({ 
        error: 'Missing required parameter: agentCardUrl' 
      });
    }

    const agentId = await discoveryService.registerAgent(agentCardUrl, authentication, options);
    const agent = discoveryService.getAgent(agentId);
    
    res.status(201).json({ 
      success: true,
      agentId,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
      }
    });
    
  } catch (error) {
    console.error('Error registering A2A agent:', error);
    res.status(500).json({ 
      error: 'Failed to register A2A agent',
      message: error.message 
    });
  }
};

/**
 * Unregister an A2A agent
 */
const unregisterA2AAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    
    await discoveryService.unregisterAgent(agentId);
    
    res.json({ 
      success: true,
      message: `Agent ${agentId} unregistered successfully` 
    });
    
  } catch (error) {
    console.error('Error unregistering A2A agent:', error);
    res.status(500).json({ 
      error: 'Failed to unregister A2A agent',
      message: error.message 
    });
  }
};

/**
 * Get A2A agent details
 */
const getA2AAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const agent = discoveryService.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ 
        error: `A2A agent not found: ${agentId}` 
      });
    }
    
    res.json({ 
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status,
        agentCard: agent.agentCard,
        transport: agent.preferredTransport,
        lastHealthCheck: agent.lastHealthCheck,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      }
    });
    
  } catch (error) {
    console.error('Error fetching A2A agent details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch A2A agent details',
      message: error.message 
    });
  }
};

module.exports = {
  getA2AAgents,
  registerA2AAgent,
  unregisterA2AAgent,
  getA2AAgent,
};