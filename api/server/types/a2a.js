/**
 * A2A Protocol Type Definitions for External Agents
 * These are separate from LibreChat's internal agent system
 */

/**
 * @typedef {Object} A2ACapabilities
 * @property {boolean} [streaming] - Supports streaming responses
 * @property {boolean} [push] - Supports push notifications
 * @property {boolean} [multiTurn] - Supports multi-turn conversations
 * @property {boolean} [taskBased] - Supports task-based workflows
 * @property {boolean} [tools] - Supports external tools
 */

/**
 * @typedef {Object} A2ASkill
 * @property {string} id - Unique skill identifier
 * @property {string} name - Human-readable skill name
 * @property {string} description - Skill description
 * @property {string[]} [inputModes] - Supported input modes
 * @property {string[]} [outputModes] - Supported output modes
 */

/**
 * @typedef {Object} A2ASecurityScheme
 * @property {'apikey'|'oauth2'|'openid'|'http'|'mutual_tls'} type - Authentication type
 * @property {string} [scheme] - HTTP authentication scheme
 * @property {string} [bearerFormat] - Bearer token format
 * @property {Object} [flows] - OAuth2 flows configuration
 * @property {string} [openIdConnectUrl] - OpenID Connect URL
 */

/**
 * @typedef {Object} A2AAgentCard
 * @property {string} protocolVersion - A2A protocol version
 * @property {string} name - Agent name
 * @property {string} description - Agent description
 * @property {string} url - Agent endpoint URL
 * @property {'JSONRPC'|'HTTP+JSON'|'GRPC'} preferredTransport - Preferred transport protocol
 * @property {string} version - Agent version
 * @property {A2ACapabilities} capabilities - Agent capabilities
 * @property {A2ASkill[]} skills - Agent skills
 * @property {Object.<string, A2ASecurityScheme>} [securitySchemes] - Security schemes
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} A2AAuthentication
 * @property {'apikey'|'oauth2'|'openid'|'http'|'mutual_tls'|'none'} type - Auth type
 * @property {Object.<string, string>} [credentials] - Authentication credentials
 * @property {Object.<string, string>} [headers] - Custom headers
 */

/**
 * @typedef {Object} A2AExternalAgent
 * @property {string} id - Unique agent identifier
 * @property {string} name - Agent display name
 * @property {string} description - Agent description
 * @property {string} agentCardUrl - URL to agent card
 * @property {A2AAgentCard} [agentCard] - Cached agent card data
 * @property {'JSONRPC'|'HTTP+JSON'|'GRPC'} preferredTransport - Transport protocol
 * @property {A2AAuthentication} authentication - Authentication configuration
 * @property {number} [timeout] - Request timeout in ms
 * @property {number} [maxRetries] - Maximum retry attempts
 * @property {boolean} [enableStreaming] - Enable streaming responses
 * @property {boolean} [enableTasks] - Enable task-based workflows
 * @property {'online'|'offline'|'error'|'unknown'} status - Current status
 * @property {Date} [lastHealthCheck] - Last health check timestamp
 * @property {Date} createdAt - Agent registration timestamp
 * @property {Date} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} A2ATask
 * @property {string} id - Unique task identifier
 * @property {string} contextId - Context identifier for related tasks
 * @property {'submitted'|'working'|'completed'|'failed'|'canceled'} status - Task status
 * @property {string} [statusMessage] - Optional status message
 * @property {A2AMessage[]} history - Message history
 * @property {A2AArtifact[]} artifacts - Generated artifacts
 * @property {Object} [metadata] - Task metadata
 * @property {Date} createdAt - Task creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} A2AMessage
 * @property {'user'|'agent'} role - Message role
 * @property {A2APart[]} parts - Message parts
 * @property {Date} timestamp - Message timestamp
 */

/**
 * @typedef {Object} A2APart
 * @property {'text'|'file'|'data'} type - Part type
 * @property {string|Buffer|Object} content - Part content
 * @property {Object} [metadata] - Part metadata
 */

/**
 * @typedef {Object} A2AArtifact
 * @property {string} id - Artifact identifier
 * @property {string} type - Artifact type
 * @property {string} name - Artifact name
 * @property {Object} content - Artifact content
 * @property {Date} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} A2AResponse
 * @property {boolean} success - Response success status
 * @property {Object} [data] - Response data
 * @property {string} [error] - Error message if failed
 * @property {A2ATask} [task] - Task information for task-based responses
 * @property {A2AMessage} [message] - Direct message response
 * @property {A2AArtifact[]} [artifacts] - Response artifacts
 */

module.exports = {
  // Export types for JSDoc usage
};