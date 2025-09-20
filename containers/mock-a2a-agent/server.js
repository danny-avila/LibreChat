const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
// Note: @a2a-js/sdk would be installed in a real implementation
// For this mock, we'll simulate the SDK functionality

/**
 * Mock A2A Agent Server
 * Simulates an A2A protocol-compliant agent for LibreChat integration testing
 */

// Mock A2A SDK classes
class MockAgentExecutor {
  constructor() {
    this.conversationHistory = new Map();
    this.activeWorkflows = new Map();
  }

  /**
   * Execute a message and return a response
   */
  async execute(message, contextId) {
    console.log(`Processing message for context ${contextId}:`, message);
    
    // Simulate processing time
    await this.delay(500 + Math.random() * 1000);
    
    // Get or create conversation history
    const history = this.conversationHistory.get(contextId) || [];
    
    // Add user message to history
    history.push({
      role: 'user',
      content: message.parts[0].content,
      timestamp: new Date(),
    });
    
    // Generate response based on message content
    const response = this.generateResponse(message.parts[0].content, history);
    
    // Add response to history
    history.push({
      role: 'agent',
      content: response,
      timestamp: new Date(),
    });
    
    // Store updated history
    this.conversationHistory.set(contextId, history.slice(-20)); // Keep last 20 messages
    
    return {
      role: 'agent',
      parts: [{ type: 'text', content: response }]
    };
  }

  /**
   * Create a task-based workflow
   */
  async createTask(message, contextId) {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Creating task ${taskId} for context ${contextId}`);
    
    const task = {
      id: taskId,
      contextId,
      status: 'working',
      statusMessage: 'Processing your request...',
      history: [
        {
          role: 'user',
          parts: [{ type: 'text', content: message.parts[0].content }],
          timestamp: new Date(),
        }
      ],
      artifacts: [],
      createdAt: new Date(),
    };
    
    this.activeWorkflows.set(taskId, task);
    
    // Simulate async processing
    this.processTaskAsync(taskId, message.parts[0].content);
    
    return task;
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId) {
    const task = this.activeWorkflows.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    return task;
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId) {
    const task = this.activeWorkflows.get(taskId);
    if (task) {
      task.status = 'canceled';
      task.statusMessage = 'Task was canceled by user';
    }
    return { success: true };
  }

  /**
   * Process task asynchronously
   */
  async processTaskAsync(taskId, content) {
    const task = this.activeWorkflows.get(taskId);
    if (!task) return;
    
    try {
      // Simulate multi-step processing
      await this.delay(2000);
      
      task.status = 'working';
      task.statusMessage = 'Analyzing request...';
      
      await this.delay(3000);
      
      task.status = 'working';
      task.statusMessage = 'Generating response...';
      
      await this.delay(2000);
      
      // Generate final response
      const response = this.generateResponse(content, [], true);
      
      task.history.push({
        role: 'agent',
        parts: [{ type: 'text', content: response }],
        timestamp: new Date(),
      });
      
      // Add artifacts for demonstration
      task.artifacts.push({
        id: `artifact-${Date.now()}`,
        type: 'text/analysis',
        name: 'Response Analysis',
        content: {
          wordCount: response.split(' ').length,
          sentiment: 'positive',
          topics: ['conversation', 'assistance'],
        },
        createdAt: new Date(),
      });
      
      task.status = 'completed';
      task.statusMessage = 'Task completed successfully';
      task.updatedAt = new Date();
      
    } catch (error) {
      task.status = 'failed';
      task.statusMessage = `Task failed: ${error.message}`;
      task.updatedAt = new Date();
    }
  }

  /**
   * Generate response based on input
   */
  generateResponse(input, history = [], isTask = false) {
    const lowerInput = input.toLowerCase();
    
    // Context-aware responses based on conversation history
    const recentMessages = history.slice(-3).map(h => h.content).join(' ').toLowerCase();
    
    // Task-based responses
    if (isTask) {
      if (lowerInput.includes('analyze') || lowerInput.includes('analysis')) {
        return `I've completed a detailed analysis of your request: "${input}". Based on my processing, I found several key insights and have generated a comprehensive response with supporting artifacts.`;
      }
      
      if (lowerInput.includes('create') || lowerInput.includes('generate')) {
        return `I've successfully created the requested content based on your specifications: "${input}". The generated output has been processed through multiple validation steps and is ready for your review.`;
      }
      
      return `Task completed successfully! I've processed your request: "${input}" and generated a comprehensive response with detailed analysis and supporting documentation.`;
    }
    
    // Greeting responses
    if (lowerInput.includes('hello') || lowerInput.includes('hi') || lowerInput.includes('hey')) {
      const greetings = [
        'Hello! I\'m your A2A protocol agent. How can I assist you today?',
        'Hi there! I\'m ready to help with your tasks using the A2A protocol.',
        'Hey! Welcome to the A2A agent interface. What would you like to work on?'
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    }
    
    // Question responses
    if (lowerInput.includes('what') || lowerInput.includes('how') || lowerInput.includes('?')) {
      if (lowerInput.includes('a2a') || lowerInput.includes('protocol')) {
        return 'The A2A (Agent-to-Agent) protocol enables interoperable communication between AI agents. I\'m a mock implementation that demonstrates the protocol\'s capabilities including message exchange, task management, and streaming responses.';
      }
      
      if (lowerInput.includes('capabilities') || lowerInput.includes('can you do')) {
        return 'I can handle various tasks including: direct conversations, task-based workflows, multi-turn interactions, and artifact generation. I support both synchronous and asynchronous processing modes as defined by the A2A protocol specification.';
      }
      
      return 'That\'s an interesting question! Based on my A2A protocol implementation, I can provide information, process tasks, and maintain conversation context. What specific aspect would you like me to elaborate on?';
    }
    
    // Task-related responses
    if (lowerInput.includes('task') || lowerInput.includes('workflow')) {
      return 'I can help you with task-based workflows! I support creating tasks, tracking their progress, and providing status updates throughout the process. Would you like me to create a task for your request?';
    }
    
    // Help responses
    if (lowerInput.includes('help') || lowerInput.includes('assistance')) {
      return 'I\'m here to help! I\'m a mock A2A protocol agent that can:\n- Engage in conversational interactions\n- Process task-based requests\n- Maintain conversation context\n- Generate structured responses and artifacts\n\nWhat would you like assistance with?';
    }
    
    // Context-aware responses
    if (recentMessages.includes('thank')) {
      return 'You\'re very welcome! I\'m glad I could help. Is there anything else you\'d like me to assist you with using the A2A protocol?';
    }
    
    // Programming/technical responses
    if (lowerInput.includes('code') || lowerInput.includes('program') || lowerInput.includes('technical')) {
      return 'I can help with technical discussions! While I\'m a mock implementation, I demonstrate how A2A protocol agents can handle technical queries, provide code insights, and support development workflows.';
    }
    
    // Default response with context
    const responses = [
      `I understand you mentioned: "${input}". As an A2A protocol agent, I'm processing your request and can provide assistance across various domains.`,
      `Thanks for your message about "${input}". I'm here to help using the A2A protocol's capabilities for agent communication and task management.`,
      `I've received your request regarding "${input}". Through the A2A protocol, I can engage in meaningful conversations and help with complex tasks.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Mock AgentCard class
class MockAgentCard {
  constructor(config) {
    this.protocolVersion = config.protocolVersion || '0.1.0';
    this.name = config.name;
    this.description = config.description;
    this.version = config.version;
    this.url = config.url;
    this.preferredTransport = config.preferredTransport || 'JSONRPC';
    this.capabilities = config.capabilities || {};
    this.skills = config.skills || [];
    this.securitySchemes = config.securitySchemes || {};
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      protocolVersion: this.protocolVersion,
      name: this.name,
      description: this.description,
      version: this.version,
      url: this.url,
      preferredTransport: this.preferredTransport,
      capabilities: this.capabilities,
      skills: this.skills,
      securitySchemes: this.securitySchemes,
      metadata: this.metadata,
    };
  }
}

// Mock A2AExpressApp class
class MockA2AExpressApp {
  constructor({ agentCard, executor }) {
    this.agentCard = agentCard;
    this.executor = executor;
    this.router = express.Router();
    this.setupRoutes();
  }

  setupRoutes() {
    // Agent card endpoint (A2A protocol requirement)
    this.router.get('/.well-known/agent-card', (req, res) => {
      res.json(this.agentCard.toJSON());
    });

    // JSON-RPC endpoint
    this.router.post('/jsonrpc', async (req, res) => {
      try {
        const { method, params, id } = req.body;
        
        let result;
        switch (method) {
          case 'message/send':
            result = await this.executor.execute(params.message, params.contextId);
            break;
          
          case 'tasks/create':
            result = await this.executor.createTask(params.message, params.contextId);
            break;
          
          case 'tasks/get':
            result = await this.executor.getTaskStatus(params.taskId);
            break;
          
          case 'tasks/cancel':
            result = await this.executor.cancelTask(params.taskId);
            break;
          
          default:
            throw new Error(`Unknown method: ${method}`);
        }
        
        res.json({
          jsonrpc: '2.0',
          result,
          id,
        });
      } catch (error) {
        console.error('JSON-RPC error:', error);
        res.json({
          jsonrpc: '2.0',
          error: {
            code: -1,
            message: error.message,
          },
          id: req.body.id,
        });
      }
    });

    // REST API endpoints (alternative to JSON-RPC)
    this.router.post('/v1/message/send', async (req, res) => {
      try {
        const result = await this.executor.execute(req.body.message, req.body.contextId);
        res.json({ message: result });
      } catch (error) {
        console.error('REST API error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.router.post('/v1/tasks/create', async (req, res) => {
      try {
        const result = await this.executor.createTask(req.body.message, req.body.contextId);
        res.json(result);
      } catch (error) {
        console.error('Task creation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.router.get('/v1/tasks/:taskId', async (req, res) => {
      try {
        const result = await this.executor.getTaskStatus(req.params.taskId);
        res.json(result);
      } catch (error) {
        console.error('Task status error:', error);
        res.status(404).json({ error: error.message });
      }
    });

    this.router.delete('/v1/tasks/:taskId', async (req, res) => {
      try {
        const result = await this.executor.cancelTask(req.params.taskId);
        res.json(result);
      } catch (error) {
        console.error('Task cancellation error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }
}

// Create agent configuration
const agentCard = new MockAgentCard({
  protocolVersion: '0.1.0',
  name: 'Mock LangChain A2A Agent',
  description: 'A mock A2A protocol agent for LibreChat integration testing and development',
  version: '1.0.0',
  url: process.env.AGENT_URL || 'http://localhost:8080',
  preferredTransport: 'JSONRPC',
  capabilities: {
    streaming: true,
    push: false,
    multiTurn: true,
    taskBased: true,
    tools: false,
  },
  skills: [
    {
      id: 'conversation',
      name: 'Conversational AI',
      description: 'Engage in natural language conversations with context awareness',
      inputModes: ['text'],
      outputModes: ['text'],
    },
    {
      id: 'task-processing',
      name: 'Task Processing',
      description: 'Handle complex, multi-step tasks with progress tracking and artifacts',
      inputModes: ['text'],
      outputModes: ['text', 'artifacts'],
    },
    {
      id: 'context-management',
      name: 'Context Management', 
      description: 'Maintain conversation history and context across interactions',
      inputModes: ['text'],
      outputModes: ['text'],
    },
    {
      id: 'protocol-demo',
      name: 'A2A Protocol Demonstration',
      description: 'Demonstrate A2A protocol features including streaming and task workflows',
      inputModes: ['text'],
      outputModes: ['text', 'status', 'artifacts'],
    },
  ],
  securitySchemes: {
    none: {
      type: 'none',
      description: 'No authentication required for this mock agent',
    },
  },
  metadata: {
    environment: 'development',
    purpose: 'testing',
    librechat_integration: true,
    mock_agent: true,
  },
});

// Create Express application
const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3080', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Create agent executor and A2A app
const executor = new MockAgentExecutor();
const a2aApp = new MockA2AExpressApp({
  agentCard,
  executor,
});

// Use A2A routes
app.use('/', a2aApp.router);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    agent: agentCard.name,
    version: agentCard.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Status endpoint with statistics
app.get('/status', (req, res) => {
  res.json({
    agent: agentCard.toJSON(),
    statistics: {
      activeConversations: executor.conversationHistory.size,
      activeWorkflows: executor.activeWorkflows.size,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Path ${req.path} not found`,
    availableEndpoints: [
      '/.well-known/agent-card',
      '/jsonrpc',
      '/v1/message/send',
      '/v1/tasks/*',
      '/health',
      '/status',
    ],
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: error.message,
  });
});

// Start server
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🤖 Mock A2A Agent Server running on http://${HOST}:${PORT}`);
  console.log(`📋 Agent Card: http://${HOST}:${PORT}/.well-known/agent-card`);
  console.log(`🔌 JSON-RPC: http://${HOST}:${PORT}/jsonrpc`);
  console.log(`🏥 Health: http://${HOST}:${PORT}/health`);
  console.log(`📊 Status: http://${HOST}:${PORT}/status`);
  console.log(`🎯 Agent: ${agentCard.name} v${agentCard.version}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Mock A2A Agent Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Mock A2A Agent Server...');
  process.exit(0);
});