const { logger } = require('@librechat/data-schemas');
const discoveryService = require('./A2ADiscoveryService');

/**
 * A2A Configuration Loader Service
 * Loads A2A agents from librechat.yaml configuration and environment variables
 */
class A2AConfigLoader {
  constructor() {
    this.isLoaded = false;
    this.configuredAgents = new Map();
  }

  /**
   * Load A2A configuration from librechat.yaml and environment variables
   * @param {Object} customConfig - The loaded librechat.yaml configuration
   */
  async loadA2AConfig(customConfig) {
    try {
      logger.info('Loading A2A configuration...');

      // Get A2A configuration from customConfig
      const a2aConfig = customConfig?.endpoints?.a2a;
      
      if (!a2aConfig || !a2aConfig.enabled) {
        logger.info('A2A endpoint not enabled in configuration');
        return;
      }

      // Start discovery service
      if (!discoveryService.isRunning) {
        discoveryService.start();
      }

      // Load environment-based agents
      await this.loadEnvironmentAgents();

      // Load configured agents from yaml (with startup delay for container readiness)
      if (a2aConfig.agents && Array.isArray(a2aConfig.agents)) {
        // Add a small delay to allow Docker containers to fully initialize
        logger.info('Waiting 3 seconds for A2A agent containers to be ready...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.loadConfiguredAgents(a2aConfig.agents, a2aConfig.defaultOptions);
      }

      // Configure discovery settings
      if (a2aConfig.discovery) {
        this.configureDiscovery(a2aConfig.discovery);
      }

      this.isLoaded = true;
      logger.info(`A2A configuration loaded successfully. ${this.configuredAgents.size} agents configured.`);

    } catch (error) {
      logger.error('Failed to load A2A configuration:', error);
      throw error;
    }
  }

  /**
   * Load A2A agents from environment variables
   */
  async loadEnvironmentAgents() {
    const envAgents = [];

    // Check for mock agent
    if (process.env.A2A_MOCK_AGENT_URL) {
      envAgents.push({
        name: 'Mock A2A Agent (Environment)',
        agentCardUrl: `${process.env.A2A_MOCK_AGENT_URL}/.well-known/agent-card`,
        authentication: { type: 'none' },
        source: 'environment'
      });
    }

    // Check for additional environment agents
    // Pattern: A2A_AGENT_<NAME>_URL and A2A_AGENT_<NAME>_API_KEY
    const envKeys = Object.keys(process.env);
    const agentUrlPattern = /^A2A_AGENT_(.+)_URL$/;
    
    for (const key of envKeys) {
      const match = key.match(agentUrlPattern);
      if (match) {
        const agentName = match[1];
        const url = process.env[key];
        const apiKeyEnv = `A2A_AGENT_${agentName}_API_KEY`;
        const apiKey = process.env[apiKeyEnv];

        if (url) {
          const agent = {
            name: `${agentName.replace(/_/g, ' ')} (Environment)`,
            agentCardUrl: url.endsWith('/.well-known/agent-card') ? url : `${url}/.well-known/agent-card`,
            authentication: apiKey ? {
              type: 'apikey',
              credentials: { apikey: apiKey }
            } : { type: 'none' },
            source: 'environment'
          };
          
          envAgents.push(agent);
        }
      }
    }

    // Register environment agents
    for (const agent of envAgents) {
      try {
        const agentId = await discoveryService.registerAgent(
          agent.agentCardUrl,
          agent.authentication,
          { source: agent.source }
        );
        
        this.configuredAgents.set(agentId, {
          ...agent,
          id: agentId,
          configuredAt: new Date(),
        });

        logger.info(`Registered environment A2A agent: ${agent.name}`);
      } catch (error) {
        logger.warn(`Failed to register environment agent ${agent.name}:`, error.message);
      }
    }
  }

  /**
   * Load A2A agents from yaml configuration
   */
  async loadConfiguredAgents(agentConfigs, defaultOptions = {}) {
    for (const agentConfig of agentConfigs) {
      try {
        logger.info(`Registering configured A2A agent: ${agentConfig.name}`);

        // Merge with default options
        const options = {
          ...defaultOptions,
          ...agentConfig.options,
          source: 'configuration'
        };

        // Process environment variable substitution in credentials
        const authentication = this.processEnvironmentVariables(agentConfig.authentication);

        // Retry logic for agent registration
        let agentId = null;
        let lastError = null;
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            agentId = await discoveryService.registerAgent(
              agentConfig.agentCardUrl,
              authentication,
              options
            );
            break; // Success, exit retry loop
          } catch (error) {
            lastError = error;
            logger.warn(`Attempt ${attempt}/${maxRetries} failed for agent ${agentConfig.name}: ${error.message}`);
            
            if (attempt < maxRetries) {
              logger.info(`Retrying in ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }

        if (agentId) {
          this.configuredAgents.set(agentId, {
            ...agentConfig,
            id: agentId,
            options,
            configuredAt: new Date(),
          });
          logger.info(`Successfully registered configured A2A agent: ${agentConfig.name}`);
        } else {
          throw lastError;
        }
      } catch (error) {
        logger.warn(`Failed to register configured agent ${agentConfig.name} after retries:`, error.message);
      }
    }
  }

  /**
   * Configure discovery service settings
   */
  configureDiscovery(discoveryConfig) {
    if (discoveryConfig.refreshInterval) {
      discoveryService.healthCheckInterval = discoveryConfig.refreshInterval;
      logger.info(`A2A health check interval set to ${discoveryConfig.refreshInterval}ms`);
    }

    if (!discoveryConfig.enabled && discoveryService.isRunning) {
      logger.info('A2A discovery disabled, stopping discovery service');
      discoveryService.stop();
    }
  }

  /**
   * Process environment variable substitution in configuration
   */
  processEnvironmentVariables(obj) {
    if (typeof obj === 'string') {
      // Process ${VAR_NAME} pattern
      return obj.replace(/\${([^}]+)}/g, (match, varName) => {
        return process.env[varName] || match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.processEnvironmentVariables(item));
    } else if (obj && typeof obj === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processEnvironmentVariables(value);
      }
      return processed;
    }
    return obj;
  }

  /**
   * Get all configured agents
   */
  getConfiguredAgents() {
    return Array.from(this.configuredAgents.values());
  }

  /**
   * Get configured agent by ID
   */
  getConfiguredAgent(agentId) {
    return this.configuredAgents.get(agentId);
  }

  /**
   * Check if A2A is enabled and loaded
   */
  isA2AEnabled() {
    return this.isLoaded && discoveryService.isRunning;
  }

  /**
   * Reload configuration
   */
  async reload(customConfig) {
    logger.info('Reloading A2A configuration...');
    
    // Clear existing configured agents
    for (const [agentId, agent] of this.configuredAgents.entries()) {
      if (agent.source === 'configuration' || agent.source === 'environment') {
        try {
          await discoveryService.unregisterAgent(agentId);
        } catch (error) {
          logger.warn(`Failed to unregister agent ${agentId} during reload:`, error.message);
        }
      }
    }
    
    this.configuredAgents.clear();
    this.isLoaded = false;
    
    // Reload configuration
    await this.loadA2AConfig(customConfig);
  }

  /**
   * Get configuration status
   */
  getStatus() {
    const agents = Array.from(this.configuredAgents.values());
    
    return {
      enabled: this.isA2AEnabled(),
      loaded: this.isLoaded,
      discoveryRunning: discoveryService.isRunning,
      configuredAgents: agents.length,
      agentsBySource: {
        environment: agents.filter(a => a.source === 'environment').length,
        configuration: agents.filter(a => a.source === 'configuration').length,
        manual: agents.filter(a => a.source === 'manual' || !a.source).length,
      },
      lastReload: this.isLoaded ? new Date().toISOString() : null,
    };
  }
}

// Singleton instance
const configLoader = new A2AConfigLoader();

module.exports = configLoader;