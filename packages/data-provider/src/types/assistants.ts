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

export type FunctionTool = {
  type: Tools;
  function?: {
    description: string;
    name: string;
    parameters: {
      [key: string]: string;
    };
  };
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
  tools: FunctionTool[];
};

export type AssistantCreateParams = {
  model: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  metadata?: Metadata | null;
  name?: string | null;
  tools?: FunctionTool[];
};

export type AssistantUpdateParams = {
  model?: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  metadata?: Metadata | null;
  name?: string | null;
  tools?: FunctionTool[];
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
  file_id: string;
  id?: string;
  temp_file_id?: string;
  bytes: number;
  created_at: number;
  filename: string;
  object: string;
  purpose: 'fine-tune' | 'fine-tune-results' | 'assistants' | 'assistants_output';
};

/**
 * Details of the Code Interpreter tool call the run step was involved in.
 * Includes the tool call ID, the code interpreter definition, and the type of tool call.
 */
export type CodeToolCall = {
  id: string; // The ID of the tool call.
  code_interpreter: {
    input: string; // The input to the Code Interpreter tool call.
    outputs: Array<Record<string, unknown>>; // The outputs from the Code Interpreter tool call.
  };
  type: 'code_interpreter'; // The type of tool call, always 'code_interpreter'.
};

/**
 * Details of a Function tool call the run step was involved in.
 * Includes the tool call ID, the function definition, and the type of tool call.
 */
export type FunctionToolCall = {
  id: string; // The ID of the tool call object.
  function: {
    arguments: string; // The arguments passed to the function.
    name: string; // The name of the function.
    output: string | null; // The output of the function, null if not submitted.
  };
  type: 'function'; // The type of tool call, always 'function'.
};

/**
 * Details of a Retrieval tool call the run step was involved in.
 * Includes the tool call ID and the type of tool call.
 */
export type RetrievalToolCall = {
  id: string; // The ID of the tool call object.
  retrieval: unknown; // An empty object for now.
  type: 'retrieval'; // The type of tool call, always 'retrieval'.
};

/**
 * Details of the tool calls involved in a run step.
 * Can be associated with one of three types of tools: `code_interpreter`, `retrieval`, or `function`.
 */
export type ToolCallsStepDetails = {
  tool_calls: Array<CodeToolCall | RetrievalToolCall | FunctionToolCall>; // An array of tool calls the run step was involved in.
  type: 'tool_calls'; // Always 'tool_calls'.
};

export type ImageFile = {
  /**
   * The [File](https://platform.openai.com/docs/api-reference/files) ID of the image
   * in the message content.
   */
  file_id: string;
  filename: string;
  filepath: string;
  height: number;
  width: number;
};

// FileCitation.ts
export type FileCitation = {
  end_index: number;
  file_citation: FileCitationDetails;
  start_index: number;
  text: string;
  type: 'file_citation';
};

export type FileCitationDetails = {
  file_id: string;
  quote: string;
};

export type FilePath = {
  end_index: number;
  file_path: FilePathDetails;
  start_index: number;
  text: string;
  type: 'file_path';
};

export type FilePathDetails = {
  file_id: string;
};

export type Text = {
  annotations?: Array<FileCitation | FilePath>;
  value: string;
};

export enum ContentTypes {
  TEXT = 'text',
  TOOL_CALL = 'tool_call',
  IMAGE_FILE = 'image_file',
}

export enum StepTypes {
  TOOL_CALLS = 'tool_calls',
  MESSAGE_CREATION = 'message_creation',
}

export enum ToolCallTypes {
  FUNCTION = 'function',
  RETRIEVAL = 'retrieval',
  CODE_INTERPRETER = 'code_interpreter',
}

export enum StepStatus {
  IN_PROGRESS = 'in_progress',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export enum MessageContentTypes {
  TEXT = 'text',
  IMAGE_FILE = 'image_file',
}

//enum for RunStatus
// The status of the run: queued, in_progress, requires_action, cancelling, cancelled, failed, completed, or expired.
export enum RunStatus {
  QUEUED = 'queued',
  IN_PROGRESS = 'in_progress',
  REQUIRES_ACTION = 'requires_action',
  CANCELLING = 'cancelling',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export type PartMetadata = {
  progress?: number;
  asset_pointer?: string;
  status?: string;
};

export type ContentPart = (CodeToolCall | RetrievalToolCall | FunctionToolCall | ImageFile | Text) &
  PartMetadata;

export type TMessageContent =
  | { type: ContentTypes.TEXT; text: Text & PartMetadata }
  | {
      type: ContentTypes.TOOL_CALL;
      tool_call: (CodeToolCall | RetrievalToolCall | FunctionToolCall) & PartMetadata;
    }
  | { type: ContentTypes.IMAGE_FILE; image_file: ImageFile & PartMetadata };

export type TContentData = TMessageContent & {
  messageId: string;
  conversationId: string;
  userMessageId: string;
  thread_id: string;
  index: number;
  stream?: boolean;
};
