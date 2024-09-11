import { Capabilities } from 'librechat-data-provider';
import type { Agent, AgentProvider, AgentModelParameters } from 'librechat-data-provider';
import type { OptionWithIcon, ExtendedFile } from './types';

export type TAgentOption = OptionWithIcon &
  Agent & {
    files?: Array<[string, ExtendedFile]>;
    code_files?: Array<[string, ExtendedFile]>;
  };

export type AgentCapabilities = {
  [Capabilities.code_interpreter]: boolean;
  [Capabilities.image_vision]: boolean;
  [Capabilities.retrieval]: boolean;
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
} & AgentCapabilities;
