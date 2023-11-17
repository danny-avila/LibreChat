export type Metadata = {
  [key: string]: unknown;
};

export enum Tools {
  code_interpreter = 'code_interpreter',
  retrieval = 'retrieval',
  function = 'function',
}

export type Tool = {
  [type: string]: Tools;
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
  limit?: number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
};

export type AssistantListResponse = {
  object: string;
  data: Assistant[];
  first_id: string;
  last_id: string;
  has_more: boolean;
};

export type File = {
  id: string; // The file identifier
  bytes: number; // The size of the file, in bytes
  created_at: number; // The Unix timestamp for when the file was created
  filename: string; // The name of the file
  object: string; // The object type, always 'file'
  purpose: 'fine-tune' | 'fine-tune-results' | 'assistants' | 'assistants_output'; // The intended purpose of the file
};
