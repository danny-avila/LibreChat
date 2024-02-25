import type { Assistant } from 'librechat-data-provider';
import type { Option, ExtendedFile } from './types';

export type TAssistantOption =
  | string
  | (Option & Assistant & { files?: Array<[string, ExtendedFile]> });

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
