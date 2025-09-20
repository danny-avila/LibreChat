const A2AClient = require('../../app/clients/A2AClient');

/**
 * A2A Discovery Service for managing external A2A protocol agents
 * This service handles agent discovery, registration, and health monitoring
 */
class A2ADiscoveryService {
  constructor() {
    /** @type {Map<string, import('../types/a2a').A2AExternalAgent>} */
    this.registeredAgents = new Map();
    
    /** @type {Map<string, A2AClient>} */
    this.agentClients = new Map();
    
    this.healthCheckInterval = 5 * 60 * 1000; // 5 minutes
    this.healthCheckTimer = null;
    this.isRunning = false;
  }

  /**
   * Start the discovery service
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    this.startHealthCheckScheduler();
    console.log('A2A Discovery Service started');
  }

  /**
   * Stop the discovery service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Cleanup agent clients
    for (const client of this.agentClients.values()) {
      client.destroy();
    }
    this.agentClients.clear();
    
    console.log('A2A Discovery Service stopped');
  }

  /**
   * Discover an A2A agent by fetching its agent card
   * @param {string} agentCardUrl - URL to the agent card
   * @returns {Promise<import('../types/a2a').A2AAgentCard>}
   */
  async discoverAgent(agentCardUrl) {
    try {
      console.log(`Discovering A2A agent at: ${agentCardUrl}`);
      
      const response = await fetch(agentCardUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LibreChat-A2A-Discovery/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const agentCard = await response.json();
      this.validateAgentCard(agentCard);
      
      console.log(`Successfully discovered agent: ${agentCard.name}`);
      return agentCard;
    } catch (error) {
      console.error(`Failed to discover agent at ${agentCardUrl}:`, error);
      throw new Error(`Agent discovery failed: ${error.message}`);
    }
  }

  /**
   * Register an external A2A agent
   * @param {string} agentCardUrl - URL to the agent card
   * @param {import('../types/a2a').A2AAuthentication} [authentication] - Authentication config
   * @param {Object} [options] - Additional options
   * @returns {Promise<string>} - Agent ID
   */
  async registerAgent(agentCardUrl, authentication = { type: 'none' }, options = {}) {
    try {
      // Discover the agent card
      const agentCard = await this.discoverAgent(agentCardUrl);
      
      // Generate unique agent ID
      const agentId = this.generateAgentId(agentCard.name, agentCard.url);
      
      // Create agent configuration
      const agentConfig = {
        id: agentId,
        name: agentCard.name,
        description: agentCard.description,
        agentCardUrl,
        agentCard,
        preferredTransport: agentCard.preferredTransport,
        authentication,
        timeout: options.timeout || 30000,
        maxRetries: options.maxRetries || 3,
        enableStreaming: options.enableStreaming !== false,
        enableTasks: options.enableTasks !== false,
        status: 'unknown',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Register the agent
      this.registeredAgents.set(agentId, agentConfig);
      
      // Create client instance
      const client = new A2AClient(agentConfig);
      this.agentClients.set(agentId, client);
      
      // Perform initial health check
      await this.performHealthCheck(agentId);
      
      console.log(`Registered A2A agent: ${agentCard.name} (${agentId})`);
      return agentId;
    } catch (error) {
      console.error(`Failed to register agent from ${agentCardUrl}:`, error);
      throw error;
    }
  }

  /**
   * Unregister an A2A agent
   * @param {string} agentId - Agent identifier
   */
  async unregisterAgent(agentId) {
    if (!this.registeredAgents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Cleanup client
    const client = this.agentClients.get(agentId);
    if (client) {
      client.destroy();
      this.agentClients.delete(agentId);
    }

    // Remove from registry
    this.registeredAgents.delete(agentId);
    
    console.log(`Unregistered A2A agent: ${agentId}`);
  }

  /**
   * Get all registered agents
   * @returns {import('../types/a2a').A2AExternalAgent[]}
   */
  getRegisteredAgents() {
    return Array.from(this.registeredAgents.values());
  }

  /**
   * Get registered agent by ID
   * @param {string} agentId - Agent identifier
   * @returns {import('../types/a2a').A2AExternalAgent | null}
   */
  getAgent(agentId) {
    return this.registeredAgents.get(agentId) || null;
  }

  /**
   * Get A2A client for an agent
   * @param {string} agentId - Agent identifier
   * @returns {A2AClient | null}
   */
  getClient(agentId) {
    return this.agentClients.get(agentId) || null;
  }

  /**
   * Get agents by capability
   * @param {string} capability - Capability name
   * @returns {import('../types/a2a').A2AExternalAgent[]}
   */
  getAgentsByCapability(capability) {
    const agents = [];
    
    for (const agent of this.registeredAgents.values()) {
      if (agent.agentCard?.capabilities && agent.agentCard.capabilities[capability]) {
        agents.push(agent);
      }
    }
    
    return agents;
  }

  /**
   * Get online agents
   * @returns {import('../types/a2a').A2AExternalAgent[]}
   */
  getOnlineAgents() {
    return Array.from(this.registeredAgents.values()).filter(
      agent => agent.status === 'online'
    );
  }

  /**
   * Refresh agent card for a registered agent
   * @param {string} agentId - Agent identifier
   */
  async refreshAgentCard(agentId) {
    const agent = this.registeredAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    try {
      const agentCard = await this.discoverAgent(agent.agentCardUrl);
      agent.agentCard = agentCard;
      agent.updatedAt = new Date();
      
      console.log(`Refreshed agent card for: ${agent.name}`);
    } catch (error) {
      console.error(`Failed to refresh agent card for ${agentId}:`, error);
      agent.status = 'error';
      throw error;
    }
  }

  /**
   * Perform health check for an agent
   * @param {string} agentId - Agent identifier
   */
  async performHealthCheck(agentId) {
    const agent = this.registeredAgents.get(agentId);
    const client = this.agentClients.get(agentId);
    
    if (!agent || !client) {
      return;
    }

    try {
      const health = await client.getHealthStatus();
      agent.status = health.status;
      agent.lastHealthCheck = health.timestamp;
      
      if (health.status === 'offline' || health.status === 'error') {
        console.warn(`Agent ${agent.name} (${agentId}) is ${health.status}`);
      }
    } catch (error) {
      agent.status = 'error';
      agent.lastHealthCheck = new Date();
      console.error(`Health check failed for agent ${agentId}:`, error);
    }
  }

  /**
   * Perform health checks for all registered agents
   */
  async performHealthChecks() {
    const agents = Array.from(this.registeredAgents.keys());
    
    console.log(`Performing health checks for ${agents.length} A2A agents`);
    
    const healthCheckPromises = agents.map(agentId => 
      this.performHealthCheck(agentId).catch(error => 
        console.error(`Health check failed for ${agentId}:`, error)
      )
    );
    
    await Promise.all(healthCheckPromises);
  }

  /**
   * Start health check scheduler
   * @private
   */
  startHealthCheckScheduler() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.performHealthChecks();
      }
    }, this.healthCheckInterval);
  }

  /**
   * Validate agent card according to A2A specification
   * @private
   */
  validateAgentCard(card) {
    const required = [
      'protocolVersion',
      'name',
      'description',
      'url',
      'preferredTransport',
      'version',
      'capabilities',
      'skills'
    ];

    for (const field of required) {
      if (!card[field]) {
        throw new Error(`Invalid agent card: missing required field '${field}'`);
      }
    }

    // Validate transport protocol
    const validTransports = ['JSONRPC', 'HTTP+JSON', 'GRPC'];
    if (!validTransports.includes(card.preferredTransport)) {
      throw new Error(`Invalid transport protocol: ${card.preferredTransport}`);
    }

    // Validate capabilities
    if (typeof card.capabilities !== 'object') {
      throw new Error('Invalid agent card: capabilities must be an object');
    }

    // Validate skills
    if (!Array.isArray(card.skills)) {
      throw new Error('Invalid agent card: skills must be an array');
    }

    for (const skill of card.skills) {
      if (!skill.id || !skill.name || !skill.description) {
        throw new Error('Invalid skill: must have id, name, and description');
      }
    }
  }

  /**
   * Generate unique agent ID
   * @private
   */
  generateAgentId(name, url) {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const urlHash = this.simpleHash(url);
    return `a2a-${sanitized}-${urlHash}`;
  }

  /**
   * Simple hash function for generating agent IDs
   * @private
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substr(0, 8);
  }
}

// Singleton instance
const discoveryService = new A2ADiscoveryService();

module.exports = discoveryService;