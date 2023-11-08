export type Metadata = {
  [key: string]: unknown;
};

export type Tool = {
  [key: string]: unknown;
};

export type Assistant = {
  id: string;
  created_at: number;
  description: string | null;
  file_ids: string[];
  instructions: string | null;
  metadata: Metadata | null;
  model: string;
  name: string | null;
  object: string;
  tools: Tool[];
};

export type AssistantCreateParams = {
  model: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  metadata?: Metadata | null;
  name?: string | null;
  tools?: Tool[];
};

export type AssistantUpdateParams = {
  model?: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  metadata?: Metadata | null;
  name?: string | null;
  tools?: Tool[];
};

export type AssistantListParams = {
  before?: string | null;
  order?: 'asc' | 'desc';
};
