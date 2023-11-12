import type { Option } from './types';
import type { Assistant } from 'librechat-data-provider';

export type TAssistantOption = string | (Option & Assistant);

export type Actions = {
  function: boolean;
  code_interpreter: boolean;
  retrieval: boolean;
};

export type CreationForm = {
  assistant: TAssistantOption;
  id: string;
  name: string | null;
  description: string | null;
  instructions: string | null;
  model: string;
} & Actions;
