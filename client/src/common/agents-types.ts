import { AgentCapabilities } from 'librechat-data-provider';
import type { Agent, AgentProvider, AgentModelParameters } from 'librechat-data-provider';
import type { OptionWithIcon, ExtendedFile } from './types';

export type TAgentOption = OptionWithIcon &
  Agent & {
    knowledge_files?: Array<[string, ExtendedFile]>;
    code_files?: Array<[string, ExtendedFile]>;
  };

export type TAgentCapabilities = {
  [AgentCapabilities.artifacts]: boolean;
  [AgentCapabilities.file_search]: boolean;
  [AgentCapabilities.execute_code]: boolean;
  [AgentCapabilities.end_after_tools]?: boolean;
  [AgentCapabilities.hide_sequential_outputs]?: boolean;
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
  agent_ids?: string[];
} & TAgentCapabilities;
