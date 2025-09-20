const { v4: uuidv4 } = require('uuid');

/**
 * A2A Client for communicating with external A2A protocol agents
 * This is separate from LibreChat's internal agent system
 */
class A2AClient {
  /**
   * @param {import('../../server/types/a2a').A2AExternalAgent} agentConfig
   */
  constructor(agentConfig) {
    this.agentConfig = agentConfig;
    this.timeout = agentConfig.timeout || 30000;
    this.maxRetries = agentConfig.maxRetries || 3;
    this.activeRequests = new Map();
  }

  /**
   * Send a message to the A2A agent
   * @param {string} message - The message to send
   * @param {string} [contextId] - Optional context ID for conversation continuity
   * @param {boolean} [taskBased=false] - Whether to use task-based interaction
   * @returns {Promise<import('../../server/types/a2a').A2AResponse>}
   */
  async sendMessage(message, contextId = null, taskBased = false) {
    const requestId = uuidv4();
    
    try {
      this.activeRequests.set(requestId, { timestamp: Date.now() });

      if (taskBased) {
        return await this.createTask(message, contextId);
      } else {
        return await this.sendDirectMessage(message, contextId);
      }
    } catch (error) {
      console.error(`A2A Client Error (${this.agentConfig.name}):`, error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Send a direct message (non-task based)
   * @private
   */
  async sendDirectMessage(message, contextId) {
    const messagePayload = {
      role: 'user',
      parts: [{ type: 'text', content: message }]
    };

    const requestData = {
      message: messagePayload,
      contextId: contextId || uuidv4(),
    };

    const response = await this.makeRequest('/message/send', requestData);
    
    return {
      success: true,
      message: response.message,
      contextId: response.contextId,
      data: response,
    };
  }

  /**
   * Create a task-based interaction
   * @private
   */
  async createTask(message, contextId) {
    const taskPayload = {
      contextId: contextId || uuidv4(),
      message: {
        role: 'user',
        parts: [{ type: 'text', content: message }]
      }
    };

    const response = await this.makeRequest('/tasks/create', taskPayload);
    
    return {
      success: true,
      task: {
        id: response.taskId || response.id,
        contextId: response.contextId,
        status: response.status || 'submitted',
        statusMessage: response.statusMessage,
        history: response.history || [],
        artifacts: response.artifacts || [],
      },
      data: response,
    };
  }

  /**
   * Get task status
   * @param {string} taskId - Task identifier
   * @returns {Promise<import('../../server/types/a2a').A2ATask>}
   */
  async getTaskStatus(taskId) {
    try {
      const response = await this.makeRequest('/tasks/get', { taskId });
      return {
        id: taskId,
        contextId: response.contextId,
        status: response.status,
        statusMessage: response.statusMessage,
        history: response.history || [],
        artifacts: response.artifacts || [],
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error(`Failed to get task status for ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task identifier
   */
  async cancelTask(taskId) {
    try {
      return await this.makeRequest('/tasks/cancel', { taskId });
    } catch (error) {
      console.error(`Failed to cancel task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Make HTTP request to A2A agent
   * @private
   */
  async makeRequest(endpoint, data, retryCount = 0) {
    const { agentCard } = this.agentConfig;
    if (!agentCard || !agentCard.url) {
      throw new Error('Agent card or URL not available');
    }

    const url = this.buildUrl(agentCard.url, endpoint, agentCard.preferredTransport);
    const headers = this.buildHeaders(agentCard.preferredTransport);
    
    const requestOptions = {
      method: 'POST',
      headers,
      body: this.buildRequestBody(data, agentCard.preferredTransport, endpoint),
      signal: AbortSignal.timeout(this.timeout),
    };

    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await this.parseResponse(response, agentCard.preferredTransport);
    } catch (error) {
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        console.warn(`Retrying request (${retryCount + 1}/${this.maxRetries}):`, error.message);
        await this.delay(1000 * Math.pow(2, retryCount)); // Exponential backoff
        return this.makeRequest(endpoint, data, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Build request URL based on transport protocol
   * @private
   */
  buildUrl(baseUrl, endpoint, transport) {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    
    switch (transport) {
      case 'JSONRPC':
        return `${cleanUrl}/jsonrpc`;
      case 'HTTP+JSON':
        return `${cleanUrl}/v1${endpoint}`;
      case 'GRPC':
        throw new Error('gRPC transport not yet supported');
      default:
        return `${cleanUrl}${endpoint}`;
    }
  }

  /**
   * Build request headers
   * @private
   */
  buildHeaders(transport) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'LibreChat-A2A-Client/1.0',
    };

    // Add authentication headers
    const { authentication } = this.agentConfig;
    if (authentication && authentication.type !== 'none') {
      Object.assign(headers, this.buildAuthHeaders(authentication));
    }

    return headers;
  }

  /**
   * Build authentication headers
   * @private
   */
  buildAuthHeaders(auth) {
    const headers = {};
    
    switch (auth.type) {
      case 'apikey':
        if (auth.credentials?.apikey) {
          headers['X-API-Key'] = auth.credentials.apikey;
        }
        break;
      case 'http':
        if (auth.credentials?.token) {
          headers['Authorization'] = `Bearer ${auth.credentials.token}`;
        }
        break;
      case 'oauth2':
        if (auth.credentials?.access_token) {
          headers['Authorization'] = `Bearer ${auth.credentials.access_token}`;
        }
        break;
    }

    // Add custom headers
    if (auth.headers) {
      Object.assign(headers, auth.headers);
    }

    return headers;
  }

  /**
   * Build request body based on transport protocol
   * @private
   */
  buildRequestBody(data, transport, endpoint) {
    switch (transport) {
      case 'JSONRPC':
        return JSON.stringify({
          jsonrpc: '2.0',
          method: endpoint.replace('/', ''),
          params: data,
          id: uuidv4(),
        });
      case 'HTTP+JSON':
      default:
        return JSON.stringify(data);
    }
  }

  /**
   * Parse response based on transport protocol
   * @private
   */
  async parseResponse(response, transport) {
    const responseData = await response.json();
    
    switch (transport) {
      case 'JSONRPC':
        if (responseData.error) {
          throw new Error(`JSON-RPC Error: ${responseData.error.message}`);
        }
        return responseData.result;
      case 'HTTP+JSON':
      default:
        return responseData;
    }
  }

  /**
   * Check if error is retryable
   * @private
   */
  isRetryableError(error) {
    // Network errors, timeouts, and 5xx server errors are retryable
    return (
      error.name === 'AbortError' ||
      error.name === 'TypeError' ||
      (error.message && error.message.includes('HTTP 5'))
    );
  }

  /**
   * Delay utility for retries
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get agent health status
   */
  async getHealthStatus() {
    try {
      const response = await fetch(`${this.agentConfig.agentCard.url}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // Short timeout for health checks
      });
      
      return {
        status: response.ok ? 'online' : 'error',
        timestamp: new Date(),
        statusCode: response.status,
      };
    } catch (error) {
      return {
        status: 'offline',
        timestamp: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.activeRequests.clear();
  }
}

module.exports = A2AClient;