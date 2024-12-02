import { Capabilities, EModelEndpoint } from 'librechat-data-provider';
import type { Assistant, AssistantsEndpoint } from 'librechat-data-provider';
import type { Option, ExtendedFile } from './types';

export type ActionsEndpoint = AssistantsEndpoint | EModelEndpoint.agents;

export type TAssistantOption =
  | string
  | (Option &
      Assistant & {
        files?: Array<[string, ExtendedFile]>;
        code_files?: Array<[string, ExtendedFile]>;
      });

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
  conversation_starters: string[];
  model: string;
  functions: string[];
  append_today_date: boolean;
} & Actions;
