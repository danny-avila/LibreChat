export { useA2AAgents, useA2AStatus, useA2ADiscovery } from './useA2AAgents';
export { useA2AChat } from './useA2AChat';

// Export types for external use
export type { 
  A2AAgent, 
  RegisterAgentParams, 
  RegisterAgentResponse 
} from './useA2AAgents';

export type {
  A2AChatMessage,
  A2AChatOptions,
  A2AChatState
} from './useA2AChat';