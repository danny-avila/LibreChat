import { Document, Types } from 'mongoose';
import type { GraphEdge } from 'librechat-data-provider';

export interface ISupportContact {
  name?: string;
  email?: string;
}

/**
 * Fallback model configuration for agents.
 * Allows specifying alternative model/provider to use when the primary model fails (rate limits, etc)
 * or when images are present in the conversation.
 */
export interface IFallbackModelConfig {
  /** The fallback provider to use */
  provider?: string;
  /** The fallback model to use */
  model?: string;
  /** Model parameters for the fallback model */
  model_parameters?: Record<string, unknown>;
  /** When to use the fallback: 'on_error' for rate limits/errors, 'on_image' for image-containing messages */
  trigger?: 'on_error' | 'on_image';
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
  /** Fallback model configuration for rate limiting or image handling */
  fallback_config?: IFallbackModelConfig;
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
  /** @deprecated Use edges instead */
  agent_ids?: string[];
  edges?: GraphEdge[];
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
