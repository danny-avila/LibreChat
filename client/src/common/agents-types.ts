import { AgentCapabilities, ArtifactModes } from 'librechat-data-provider';
import type {
  AgentModelParameters,
  AgentSubagentsConfig,
  AgentToolOptions,
  SupportContact,
  AgentProvider,
  MemoryScope,
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
  [AgentCapabilities.memory]?: boolean;
  [AgentCapabilities.end_after_tools]?: boolean;
  [AgentCapabilities.hide_sequential_outputs]?: boolean;
  [AgentCapabilities.stateful_code_sessions]?: boolean;
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
  /** Per-tool configuration options (deferred loading, allowed callers, etc.) */
  tool_options?: AgentToolOptions;
  skills?: string[];
  skills_enabled?: boolean;
  /** Memory partition: 'agent' isolates memories per (user, agent); default shared pool */
  memory_scope?: MemoryScope;
  provider?: AgentProvider | OptionWithIcon;
  /** @deprecated Use edges instead */
  agent_ids?: string[];
  edges?: GraphEdge[];
  subagents?: AgentSubagentsConfig;
  [AgentCapabilities.artifacts]?: ArtifactModes | string;
  recursion_limit?: number;
  support_contact?: SupportContact;
  category: string;
  // Avatar management fields
  avatar_file?: File | null;
  avatar_preview?: string | null;
  avatar_action?: 'upload' | 'reset' | null;
} & TAgentCapabilities;
