import { Capabilities } from 'librechat-data-provider';
import type { Assistant } from 'librechat-data-provider';
import type { Option, ExtendedFile } from './types';

export type TAssistantOption =
  | string
  | (Option & Assistant & { files?: Array<[string, ExtendedFile]> });

export type Actions = {
  [Capabilities.code_interpreter]: boolean;
  [Capabilities.image_vision]: boolean;
  [Capabilities.retrieval]: boolean;
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
