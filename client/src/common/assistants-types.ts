import type { Option } from './types';
import type { Assistant } from 'librechat-data-provider';

export type TAssistantOption = string | (Option & Assistant);

export type Actions = {
  code_interpreter: boolean;
  retrieval: boolean;
};

export type AssistantForm = {
  assistant: TAssistantOption;
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  model: string;
  functions: string[];
} & Actions;
