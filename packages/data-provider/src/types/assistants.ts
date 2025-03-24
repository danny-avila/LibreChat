import type { OpenAPIV3 } from 'openapi-types';
import type { AssistantsEndpoint, AgentProvider } from 'src/schemas';
import type { ContentTypes } from './runs';
import type { Agents } from './agents';
import type { TFile } from './files';
import { ArtifactModes } from 'src/artifacts';

export type Schema = OpenAPIV3.SchemaObject & { description?: string };
export type Reference = OpenAPIV3.ReferenceObject & { description?: string };

export type Metadata = {
  avatar?: string;
  author?: string;
} & {
  [key: string]: unknown;
};

export enum Tools {
  execute_code = 'execute_code',
  code_interpreter = 'code_interpreter',
  file_search = 'file_search',
  retrieval = 'retrieval',
  function = 'function',
}

export enum EToolResources {
  code_interpreter = 'code_interpreter',
  execute_code = 'execute_code',
  file_search = 'file_search',
  ocr = 'ocr',
}

export type Tool = {
  [type: string]: Tools;
};

export type FunctionTool = {
  type: Tools;
  function?: {
    description: string;
    name: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
    additionalProperties?: boolean; // must be false if strict is true https://platform.openai.com/docs/guides/structured-outputs/some-type-specific-keywords-are-not-yet-supported
  };
};

/**
 * A set of resources that are used by the assistant's tools. The resources are
 * specific to the type of tool. For example, the `code_interpreter` tool requires
 * a list of file IDs, while the `file_search` tool requires a list of vector store
 * IDs.
 */
export interface ToolResources {
  code_interpreter?: CodeInterpreterResource;
  file_search?: FileSearchResource;
}
export interface CodeInterpreterResource {
  /**
   * A list of [file](https://platform.openai.com/docs/api-reference/files) IDs made
   * available to the `code_interpreter`` tool. There can be a maximum of 20 files
   * associated with the tool.
   */
  file_ids?: Array<string>;
}

export interface FileSearchResource {
  /**
   * The ID of the
   * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object)
   * attached to this assistant. There can be a maximum of 1 vector store attached to
   * the assistant.
   */
  vector_store_ids?: Array<string>;
}

/* Assistant types */

export type Assistant = {
  id: string;
  created_at: number;
  description: string | null;
  file_ids?: string[];
  instructions: string | null;
  conversation_starters?: string[];
  metadata: Metadata | null;
  model: string;
  name: string | null;
  object: string;
  tools?: FunctionTool[];
  tool_resources?: ToolResources;
};

export type TAssistantsMap = Record<AssistantsEndpoint, Record<string, Assistant>>;

export type AssistantCreateParams = {
  model: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  conversation_starters?: string[];
  metadata?: Metadata | null;
  name?: string | null;
  tools?: Array<FunctionTool | string>;
  endpoint: AssistantsEndpoint;
  version: number | string;
  append_current_datetime?: boolean;
};

export type AssistantUpdateParams = {
  model?: string;
  description?: string | null;
  file_ids?: string[];
  instructions?: string | null;
  conversation_starters?: string[] | null;
  metadata?: Metadata | null;
  name?: string | null;
  tools?: Array<FunctionTool | string>;
  tool_resources?: ToolResources;
  endpoint: AssistantsEndpoint;
  append_current_datetime?: boolean;
};

export type AssistantListParams = {
  limit?: number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  endpoint: AssistantsEndpoint;
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

/* Agent types */

export type AgentParameterValue = number | string | null;

export type AgentModelParameters = {
  model?: string;
  temperature: AgentParameterValue;
  maxContextTokens: AgentParameterValue;
  max_context_tokens: AgentParameterValue;
  max_output_tokens: AgentParameterValue;
  top_p: AgentParameterValue;
  frequency_penalty: AgentParameterValue;
  presence_penalty: AgentParameterValue;
};

export interface AgentToolResources {
  execute_code?: ExecuteCodeResource;
  file_search?: AgentFileResource;
  ocr?: Omit<AgentFileResource, 'vector_store_ids'>;
}
export interface ExecuteCodeResource {
  /**
   * A list of file IDs made available to the `execute_code` tool.
   * There can be a maximum of 20 files associated with the tool.
   */
  file_ids?: Array<string>;
  /**
   * A list of files already fetched.
   */
  files?: Array<TFile>;
}

export interface AgentFileResource {
  /**
   * The ID of the vector store attached to this agent. There
   * can be a maximum of 1 vector store attached to the agent.
   */
  vector_store_ids?: Array<string>;
  /**
   * A list of file IDs made available to the `file_search` tool.
   * To be used before vector stores are implemented.
   */
  file_ids?: Array<string>;
  /**
   * A list of files already fetched.
   */
  files?: Array<TFile>;
}

export type Agent = {
  id: string;
  name: string | null;
  author?: string | null;
  /** The original custom endpoint name, lowercased */
  endpoint?: string | null;
  authorName?: string | null;
  description: string | null;
  created_at: number;
  avatar: AgentAvatar | null;
  instructions: string | null;
  additional_instructions?: string | null;
  tools?: string[];
  projectIds?: string[];
  tool_kwargs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provider: AgentProvider;
  model: string | null;
  model_parameters: AgentModelParameters;
  conversation_starters?: string[];
  isCollaborative?: boolean;
  tool_resources?: AgentToolResources;
  agent_ids?: string[];
  end_after_tools?: boolean;
  hide_sequential_outputs?: boolean;
  artifacts?: ArtifactModes;
  recursion_limit?: number;
};

export type TAgentsMap = Record<string, Agent | undefined>;

export type AgentCreateParams = {
  name?: string | null;
  description?: string | null;
  avatar?: AgentAvatar | null;
  file_ids?: string[];
  instructions?: string | null;
  tools?: Array<FunctionTool | string>;
  provider: AgentProvider;
  model: string | null;
  model_parameters: AgentModelParameters;
} & Pick<
  Agent,
  'agent_ids' | 'end_after_tools' | 'hide_sequential_outputs' | 'artifacts' | 'recursion_limit'
>;

export type AgentUpdateParams = {
  name?: string | null;
  description?: string | null;
  avatar?: AgentAvatar | null;
  file_ids?: string[];
  instructions?: string | null;
  tools?: Array<FunctionTool | string>;
  tool_resources?: ToolResources;
  provider?: AgentProvider;
  model?: string | null;
  model_parameters?: AgentModelParameters;
  projectIds?: string[];
  removeProjectIds?: string[];
  isCollaborative?: boolean;
} & Pick<
  Agent,
  'agent_ids' | 'end_after_tools' | 'hide_sequential_outputs' | 'artifacts' | 'recursion_limit'
>;

export type AgentListParams = {
  limit?: number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  provider?: AgentProvider;
};

export type AgentListResponse = {
  object: string;
  data: Agent[];
  first_id: string;
  last_id: string;
  has_more: boolean;
};

export type AgentFile = {
  file_id: string;
  id?: string;
  temp_file_id?: string;
  bytes: number;
  created_at: number;
  filename: string;
  object: string;
  purpose: 'fine-tune' | 'fine-tune-results' | 'agents' | 'agents_output';
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
 * Details of a Retrieval tool call the run step was involved in.
 * Includes the tool call ID and the type of tool call.
 */
export type FileSearchToolCall = {
  id: string; // The ID of the tool call object.
  file_search: unknown; // An empty object for now.
  type: 'file_search'; // The type of tool call, always 'retrieval'.
};

/**
 * Details of the tool calls involved in a run step.
 * Can be associated with one of three types of tools: `code_interpreter`, `retrieval`, or `function`.
 */
export type ToolCallsStepDetails = {
  tool_calls: Array<CodeToolCall | RetrievalToolCall | FileSearchToolCall | FunctionToolCall>; // An array of tool calls the run step was involved in.
  type: 'tool_calls'; // Always 'tool_calls'.
};

export type ImageFile = TFile & {
  /**
   * The [File](https://platform.openai.com/docs/api-reference/files) ID of the image
   * in the message content.
   */
  file_id: string;
  filename: string;
  filepath: string;
  height: number;
  width: number;
  /**
   * Prompt used to generate the image if applicable.
   */
  prompt?: string;
  /**
   * Additional metadata used to generate or about the image/tool_call.
   */
  metadata?: Record<string, unknown>;
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

export enum AnnotationTypes {
  FILE_CITATION = 'file_citation',
  FILE_PATH = 'file_path',
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
  action?: boolean;
  auth?: string;
  expires_at?: number;
};

export type ContentPart = (
  | CodeToolCall
  | RetrievalToolCall
  | FileSearchToolCall
  | FunctionToolCall
  | Agents.AgentToolCall
  | ImageFile
  | Text
) &
  PartMetadata;

export type TMessageContentParts =
  | { type: ContentTypes.ERROR; text: Text & PartMetadata }
  | { type: ContentTypes.THINK; think: string | (Text & PartMetadata) }
  | { type: ContentTypes.TEXT; text: string | (Text & PartMetadata); tool_call_ids?: string[] }
  | {
      type: ContentTypes.TOOL_CALL;
      tool_call: (
        | CodeToolCall
        | RetrievalToolCall
        | FileSearchToolCall
        | FunctionToolCall
        | Agents.AgentToolCall
      ) &
        PartMetadata;
    }
  | { type: ContentTypes.IMAGE_FILE; image_file: ImageFile & PartMetadata }
  | Agents.AgentUpdate
  | Agents.MessageContentImageUrl;

export type StreamContentData = TMessageContentParts & {
  /** The index of the current content part */
  index: number;
  /** The current text content was already served but edited to replace elements therein */
  edited?: boolean;
};

export type TContentData = StreamContentData & {
  messageId: string;
  conversationId: string;
  userMessageId: string;
  thread_id: string;
  stream?: boolean;
};

export const actionDelimiter = '_action_';
export const actionDomainSeparator = '---';
export const hostImageIdSuffix = '_host_copy';
export const hostImageNamePrefix = 'host_copy_';

export enum AuthTypeEnum {
  ServiceHttp = 'service_http',
  OAuth = 'oauth',
  None = 'none',
}

export enum AuthorizationTypeEnum {
  Bearer = 'bearer',
  Basic = 'basic',
  Custom = 'custom',
}

export enum TokenExchangeMethodEnum {
  DefaultPost = 'default_post',
  BasicAuthHeader = 'basic_auth_header',
}

export type ActionAuth = {
  authorization_type?: AuthorizationTypeEnum;
  custom_auth_header?: string;
  type?: AuthTypeEnum;
  authorization_content_type?: string;
  authorization_url?: string;
  client_url?: string;
  scope?: string;
  token_exchange_method?: TokenExchangeMethodEnum;
};

export type ActionMetadata = {
  api_key?: string;
  auth?: ActionAuth;
  domain?: string;
  privacy_policy_url?: string;
  raw_spec?: string;
  oauth_client_id?: string;
  oauth_client_secret?: string;
};

export type ActionMetadataRuntime = ActionMetadata & {
  oauth_access_token?: string;
  oauth_refresh_token?: string;
  oauth_token_expires_at?: Date;
};

/* Assistant types */

export type Action = {
  action_id: string;
  type?: string;
  settings?: Record<string, unknown>;
  metadata: ActionMetadata;
  version: number | string;
} & ({ assistant_id: string; agent_id?: never } | { assistant_id?: never; agent_id: string });

export type AssistantAvatar = {
  filepath: string;
  source: string;
};

export type AssistantDocument = {
  user: string;
  assistant_id: string;
  conversation_starters?: string[];
  avatar?: AssistantAvatar;
  access_level?: number;
  file_ids?: string[];
  actions?: string[];
  createdAt?: Date;
  updatedAt?: Date;
  append_current_datetime?: boolean;
};

/* Agent types */

export type AgentAvatar = {
  filepath: string;
  source: string;
};

export enum FilePurpose {
  Vision = 'vision',
  FineTune = 'fine-tune',
  FineTuneResults = 'fine-tune-results',
  Assistants = 'assistants',
  AssistantsOutput = 'assistants_output',
}

export const defaultOrderQuery: {
  order: 'desc';
  limit: 100;
} = {
  order: 'desc',
  limit: 100,
};

export enum AssistantStreamEvents {
  ThreadCreated = 'thread.created',
  ThreadRunCreated = 'thread.run.created',
  ThreadRunQueued = 'thread.run.queued',
  ThreadRunInProgress = 'thread.run.in_progress',
  ThreadRunRequiresAction = 'thread.run.requires_action',
  ThreadRunCompleted = 'thread.run.completed',
  ThreadRunFailed = 'thread.run.failed',
  ThreadRunCancelling = 'thread.run.cancelling',
  ThreadRunCancelled = 'thread.run.cancelled',
  ThreadRunExpired = 'thread.run.expired',
  ThreadRunStepCreated = 'thread.run.step.created',
  ThreadRunStepInProgress = 'thread.run.step.in_progress',
  ThreadRunStepCompleted = 'thread.run.step.completed',
  ThreadRunStepFailed = 'thread.run.step.failed',
  ThreadRunStepCancelled = 'thread.run.step.cancelled',
  ThreadRunStepExpired = 'thread.run.step.expired',
  ThreadRunStepDelta = 'thread.run.step.delta',
  ThreadMessageCreated = 'thread.message.created',
  ThreadMessageInProgress = 'thread.message.in_progress',
  ThreadMessageCompleted = 'thread.message.completed',
  ThreadMessageIncomplete = 'thread.message.incomplete',
  ThreadMessageDelta = 'thread.message.delta',
  ErrorEvent = 'error',
}
