import { AgentCapabilities, ArtifactModes } from 'librechat-data-provider';
import type {
  AgentModelParameters,
  FallbackModelConfig,
  MultimodalModelConfig,
  SupportContact,
  AgentProvider,
  GraphEdge,
  Agent,
} from 'librechat-data-provider';
import type { OptionWithIcon, ExtendedFile } from './types';

export type TAgentOption = OptionWithIcon &
  Agent & {
    knowledge_files?: Array<[string, ExtendedFile]>;
    context_files?: Array<[string, ExtendedFile]>;
    code_files?: Array<[string, ExtendedFile]>;
    _id?: string;
  };

export type TAgentCapabilities = {
  [AgentCapabilities.web_search]: boolean;
  [AgentCapabilities.file_search]: boolean;
  [AgentCapabilities.execute_code]: boolean;
  [AgentCapabilities.end_after_tools]?: boolean;
  [AgentCapabilities.hide_sequential_outputs]?: boolean;
};

/**
 * Fallback model configuration for agent forms.
 * Extended from FallbackModelConfig to support OptionWithIcon for provider dropdown.
 */
export type AgentFormFallbackConfig = Omit<FallbackModelConfig, 'provider'> & {
  provider?: AgentProvider | OptionWithIcon;
};

/**
 * Multimodal model configuration for agent forms.
 * Extended from MultimodalModelConfig to support OptionWithIcon for provider dropdown.
 */
export type AgentFormMultimodalConfig = Omit<MultimodalModelConfig, 'provider'> & {
  provider?: AgentProvider | OptionWithIcon;
};

export type AgentForm = {
  agent?: TAgentOption;
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  model: string | null;
  model_parameters: AgentModelParameters;
  tools?: string[];
  provider?: AgentProvider | OptionWithIcon;
  /** @deprecated Use edges instead */
  agent_ids?: string[];
  edges?: GraphEdge[];
  [AgentCapabilities.artifacts]?: ArtifactModes | string;
  recursion_limit?: number;
  support_contact?: SupportContact;
  /** Fallback model configuration for rate limiting or errors */
  fallback_config?: AgentFormFallbackConfig;
  /** Multimodal model configuration for image, video or audio handling */
  multimodal_config?: AgentFormMultimodalConfig;
  category: string;
  // Avatar management fields
  avatar_file?: File | null;
  avatar_preview?: string | null;
  avatar_action?: 'upload' | 'reset' | null;
} & TAgentCapabilities;
