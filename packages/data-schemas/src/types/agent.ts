import { Document, Types } from 'mongoose';

export interface ISupportContact {
  name?: string;
  email?: string;
}

export interface IA2ACapabilities {
  streaming?: boolean;
  push?: boolean;
  multiTurn?: boolean;
  taskBased?: boolean;
  tools?: boolean;
}

export interface IA2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export interface IA2ASecurityScheme {
  type: 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls';
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, unknown>;
  openIdConnectUrl?: string;
}

export interface IA2AAuthentication {
  type: 'apikey' | 'oauth2' | 'openid' | 'http' | 'mutual_tls' | 'none';
  credentials?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface IA2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  version: string;
  capabilities: IA2ACapabilities;
  skills: IA2ASkill[];
  securitySchemes?: Record<string, IA2ASecurityScheme>;
  metadata?: Record<string, unknown>;
}

export interface IA2AConfig {
  agent_card_url: string;
  agent_card?: IA2AAgentCard;
  preferred_transport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  authentication: IA2AAuthentication;
  timeout?: number;
  max_retries?: number;
  enable_streaming?: boolean;
  enable_tasks?: boolean;
  health_check_interval?: number;
  last_health_check?: Date;
  status?: 'online' | 'offline' | 'error' | 'unknown';
}

export interface IAgent extends Omit<Document, 'model'> {
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  provider: string;
  model: string;
  model_parameters?: Record<string, unknown>;
  artifacts?: string;
  access_level?: number;
  recursion_limit?: number;
  tools?: string[];
  tool_kwargs?: Array<unknown>;
  actions?: string[];
  author: Types.ObjectId;
  authorName?: string;
  hide_sequential_outputs?: boolean;
  end_after_tools?: boolean;
  agent_ids?: string[];
  /** @deprecated Use ACL permissions instead */
  isCollaborative?: boolean;
  conversation_starters?: string[];
  tool_resources?: unknown;
  projectIds?: Types.ObjectId[];
  versions?: Omit<IAgent, 'versions'>[];
  category: string;
  support_contact?: ISupportContact;
  is_promoted?: boolean;
}
