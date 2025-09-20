/**
 * A2A (Agent-to-Agent) Protocol Types
 * Types for external A2A agent integration
 */

export interface A2ACapabilities {
  streaming?: boolean;
  push?: boolean;
  multiTurn?: boolean;
  taskBased?: boolean;
  tools?: boolean;
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface A2ASecurityScheme {
  type: 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls';
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, unknown>;
  openIdConnectUrl?: string;
}

export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  version: string;
  capabilities: A2ACapabilities;
  skills: A2ASkill[];
  securitySchemes?: Record<string, A2ASecurityScheme>;
  metadata?: Record<string, unknown>;
}

export interface A2AAuthentication {
  type: 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls' | 'none';
  credentials?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface A2AAgentConfig {
  name: string;
  agentCardUrl: string;
  authentication: A2AAuthentication;
  options?: {
    timeout?: number;
    maxRetries?: number;
    enableStreaming?: boolean;
    enableTasks?: boolean;
  };
}

export interface A2AExternalAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  agentCardUrl: string;
  agentCard?: A2AAgentCard;
  preferredTransport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  authentication: A2AAuthentication;
  capabilities?: A2ACapabilities;
  skills?: A2ASkill[];
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: 'submitted' | 'working' | 'completed' | 'failed' | 'canceled';
  statusMessage?: string;
  history: A2AMessage[];
  artifacts: A2AArtifact[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
  timestamp?: string;
}

export interface A2APart {
  type: 'text' | 'file' | 'data';
  content: string | Buffer | unknown;
  metadata?: Record<string, unknown>;
}

export interface A2AArtifact {
  id: string;
  type: string;
  name: string;
  content: unknown;
  createdAt: string;
}

export interface A2AConversationUpdate {
  agentId: string;
  agentName: string;
  taskId?: string;
  artifacts?: A2AArtifact[];
  transport?: string;
}

// Configuration types for librechat.yaml
export interface A2AEndpointConfig {
  enabled?: boolean;
  discovery?: {
    enabled?: boolean;
    refreshInterval?: number;
  };
  agents?: A2AAgentConfig[];
  defaultOptions?: {
    timeout?: number;
    maxRetries?: number;
    enableStreaming?: boolean;
    enableTasks?: boolean;
  };
}