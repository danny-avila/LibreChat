import type { OpenAPIV3 } from 'openapi-types';
import type { AssistantsEndpoint, AgentProvider, MemoryScope } from 'src/schemas';
import type { StatefulCodeEnvironment } from '../stateful-code';
import type { Agents, GraphEdge } from './agents';
import type { ContentTypes } from './runs';
import type { TFile } from './files';
import { ArtifactModes } from 'src/artifacts';
export {
  STATEFUL_CODE_ENVIRONMENTS,
  resolveStatefulCodeEnvironment,
  resolveAllowedStatefulCodeEnvironments,
} from '../stateful-code';
export type { StatefulCodeEnvironment } from '../stateful-code';

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
  web_search = 'web_search',
  retrieval = 'retrieval',
  function = 'function',
  memory = 'memory',
  ui_resources = 'ui_resources',
  skill = 'skill',
  read_file = 'read_file',
  bash_tool = 'bash_tool',
}

export enum EToolResources {
  code_interpreter = 'code_interpreter',
  execute_code = 'execute_code',
  file_search = 'file_search',
  image_edit = 'image_edit',
  context = 'context',
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
  useResponsesApi?: boolean;
};

export interface AgentBaseResource {
  /**
   * A list of file IDs made available to the tool.
   */
  file_ids?: Array<string>;
  /**
   * A list of files already fetched.
   */
  files?: Array<TFile>;
}

export interface AgentToolResources {
  [EToolResources.image_edit]?: AgentBaseResource;
  [EToolResources.execute_code]?: ExecuteCodeResource;
  [EToolResources.file_search]?: AgentFileResource;
  [EToolResources.context]?: AgentBaseResource;
  /** @deprecated Use context instead */
  [EToolResources.ocr]?: AgentBaseResource;
}
/**
 * A resource for the execute_code tool.
 * Contains file IDs made available to the tool (max 20 files) and already fetched files.
 */
export type ExecuteCodeResource = AgentBaseResource;

export interface AgentFileResource extends AgentBaseResource {
  /**
   * The ID of the vector store attached to this agent. There
   * can be a maximum of 1 vector store attached to the agent.
   */
  vector_store_ids?: Array<string>;
}
export type SupportContact = {
  name?: string;
  email?: string;
};

export type AgentOwnerContact = {
  name?: string;
};

/**
 * Specifies who can invoke a tool.
 * - 'direct': LLM can call directly
 * - 'code_execution': Only callable via programmatic tool calling (PTC)
 */
export type AllowedCaller = 'direct' | 'code_execution';

/**
 * Per-tool configuration options stored at the agent level.
 * Keyed by tool_id (e.g., "search_mcp_github").
 */
export type ToolOptions = {
  /**
   * If true, the tool uses deferred loading (discoverable via tool search).
   * @default false
   */
  defer_loading?: boolean;
  /**
   * Specifies who can invoke this tool.
   * - 'direct': LLM can call directly (default behavior)
   * - 'code_execution': Only callable via PTC sandbox
   * @default ['direct']
   */
  allowed_callers?: AllowedCaller[];
  /**
   * If true (and the `run_in_background` capability is enabled), the tool's
   * schema gains a `run_in_background` boolean so the model can dispatch the
   * call detached and poll its result via `check_background_task`.
   * @default false
   */
  run_in_background?: boolean;
  /**
   * If true (and the `tool_intents` capability is enabled), the tool's schema
   * gains an `intent` string as its FIRST property — one model-authored
   * sentence per call, rendered as the call's live status label. Native host
   * tools default on while the capability is enabled; `false` opts one out.
   * @default false
   */
  describe_intent?: boolean;
};

/**
 * Map of tool_id to its configuration options.
 * Used to customize tool behavior per agent.
 */
export type AgentToolOptions = Record<string, ToolOptions>;

/**
 * Configuration for spawning subagents (isolated-context child agents) from an agent.
 * When `enabled` is true, the agent gets a subagent-spawn tool that can delegate work
 * to itself, listed single-agent targets, and/or explicit saved-agent teams.
 */
export type AgentSubagentGraphEdge = Omit<
  GraphEdge,
  'edgeType' | 'condition' | 'prompt' | 'promptKey'
> & {
  edgeType: 'direct';
  condition?: never;
  prompt?: string;
  promptKey?: never;
};

/** A bounded saved-agent team that can be spawned as one isolated child graph. */
export type AgentSubagentGraph = {
  /** Stable spawn-tool enum value for the team. */
  type: string;
  name: string;
  description: string;
  /** Member IDs. In create/update payloads, an empty ID refers to the current agent. */
  agent_ids: string[];
  edges: AgentSubagentGraphEdge[];
  /** Entry member ID. In create/update payloads, an empty ID refers to the current agent. */
  entry_agent_id: string;
  /** Result member ID. In create/update payloads, an empty ID refers to the current agent. */
  result_agent_id: string;
};

export type AgentSubagentsConfig = {
  enabled?: boolean;
  /** When true (default), the agent may spawn itself in an isolated context. */
  allowSelf?: boolean;
  /** Specific agents that may be spawned as subagents. */
  agent_ids?: string[];
  /** Explicit saved-agent teams that may be spawned as bounded child graphs. */
  graphs?: AgentSubagentGraph[];
};

export type Agent = {
  _id?: string;
  id: string;
  name: string | null;
  author?: string | null;
  /** The original custom endpoint name, lowercased */
  endpoint?: string | null;
  authorName?: string | null;
  description: string | null;
  created_at: number;
  avatar: AgentAvatar | null;
  instructions?: string | null;
  additional_instructions?: string | null;
  tools?: string[];
  tool_kwargs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provider: AgentProvider;
  model: string | null;
  model_parameters: AgentModelParameters;
  conversation_starters?: string[];
  tool_resources?: AgentToolResources;
  /** @deprecated Use edges instead */
  agent_ids?: string[];
  edges?: GraphEdge[];
  end_after_tools?: boolean;
  hide_sequential_outputs?: boolean;
  /** Per-agent opt-in for stateful code sessions (requires the app-level capability). */
  stateful_code_sessions?: boolean;
  /** Stateful workspace sharing scope. Defaults to one workspace per user. */
  stateful_code_environment?: StatefulCodeEnvironment;
  /** Operator-configured managed or attached stateful execution environment. */
  code_environment_id?: string | null;
  artifacts?: ArtifactModes;
  recursion_limit?: number;
  isPublic?: boolean;
  /**
   * Whether the requesting user holds EDIT on this agent, so a single VIEW-scoped fetch can
   * serve consumers that only need the editable subset instead of issuing a second full
   * paginated walk under an EDIT-scoped cache key.
   *
   * Set by the list endpoint only; single-agent responses omit it. Treat absence as unknown
   * and fail open (`isEditable !== false`), never as `false`, since a client on an older
   * server would otherwise see an empty list rather than too many rows.
   *
   * Reflects the caller's ACL grant. The `MANAGE_AGENTS` capability bypasses ACL on write,
   * so a capability holder can edit agents this flag reports as not editable.
   */
  isEditable?: boolean;
  version?: number;
  category?: string;
  support_contact?: SupportContact;
  owner_contact?: AgentOwnerContact;
  /** Per-tool configuration options (deferred loading, allowed callers, etc.) */
  tool_options?: AgentToolOptions;
  /** Attached action registrations, each `${encodedDomain}${actionDelimiter}${action_id}` */
  actions?: string[];
  /** Optional allowlist of skill ObjectIds. Only applies when `skills_enabled`. */
  skills?: string[];
  /** Master toggle for skill use on this agent. `true` = active (full catalog unless
   *  `skills` narrows it). `false`/undefined = inactive (no skills available). */
  skills_enabled?: boolean;
  /** Subagent spawning configuration — isolated-context child agents. */
  subagents?: AgentSubagentsConfig;
  /** Memory partition: `agent` isolates memories per (user, agent); default shared pool */
  memory_scope?: MemoryScope;
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
  | 'agent_ids'
  | 'edges'
  | 'end_after_tools'
  | 'hide_sequential_outputs'
  | 'stateful_code_sessions'
  | 'stateful_code_environment'
  | 'code_environment_id'
  | 'artifacts'
  | 'recursion_limit'
  | 'category'
  | 'support_contact'
  | 'tool_options'
  | 'skills'
  | 'skills_enabled'
  | 'subagents'
  | 'memory_scope'
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
} & Pick<
  Agent,
  | 'agent_ids'
  | 'edges'
  | 'end_after_tools'
  | 'hide_sequential_outputs'
  | 'stateful_code_sessions'
  | 'stateful_code_environment'
  | 'code_environment_id'
  | 'artifacts'
  | 'recursion_limit'
  | 'category'
  | 'support_contact'
  | 'tool_options'
  | 'skills'
  | 'skills_enabled'
  | 'subagents'
  | 'memory_scope'
>;

export type AgentListParams = {
  limit?: number;
  requiredPermission: number;
  category?: string;
  search?: string;
  cursor?: string;
  promoted?: 0 | 1;
};

export type AgentListResponse = {
  object: string;
  data: Agent[];
  first_id: string;
  last_id: string;
  has_more: boolean;
  after?: string;
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
  /** Index indicating parallel sibling content (same stepIndex in multi-agent runs) */
  siblingIndex?: number;
  /** Agent ID for parallel agent rendering - identifies which agent produced this content */
  agentId?: string;
  /** Group ID for parallel content - parts with same groupId are displayed in columns */
  groupId?: number;
  /**
   * Terminal lifecycle status of the run step that produced this part, from
   * `on_run_step_closed`. Distinct from `status`, which is already claimed by
   * activity-label and question-form parts. Absent on parts predating the
   * event or from endpoints that do not emit it, in which case renderers fall
   * back to inferring "stopped" from `progress` and `isSubmitting`.
   */
  runStepStatus?: Agents.RunStepClosedStatus;
  /**
   * Wall-clock milliseconds the run step took, derived from the same
   * `on_run_step_closed` event as {@link runStepStatus} via
   * `getRunStepDurationMs`. Only written when the event carried both
   * timestamps and they agree in order — so its absence means "not
   * derivable", never "instant". The raw value is persisted unfiltered;
   * whether it is worth showing (`isReportableRunStepDuration`) is decided
   * at render time.
   */
  runStepDurationMs?: number;
  /**
   * Stamped by the background harvester when a detached task's final output
   * replaces the dispatch handle in `tool_call.output`. The handle JSON and
   * the live status-marker attachment are both transient, so after the patch
   * (or a reload) this is the only signal that the call ran in the
   * background — renderers use it to keep treating {@link runStepDurationMs}
   * as dispatch time rather than the task's runtime.
   */
  backgrounded?: boolean;
  /**
   * Content index this part occupied while its run streamed. The aggregator
   * writes parts at provider-source indexes, so the streamed array is sparse;
   * persistence compacts it and every part after a hole shifts down. The
   * client's final handler stamps the streamed position onto the compacted
   * parts it adopts, so index-derived render identity survives the swap
   * instead of remounting the settled message. Client-only and absent
   * everywhere else — persisted content never carries it.
   */
  streamedIndex?: number;
};

/** Metadata for parallel content rendering - subset of PartMetadata */
export type ContentMetadata = Pick<PartMetadata, 'agentId' | 'groupId' | 'streamedIndex'>;

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

export type TextData = (Text & PartMetadata) | undefined;

export type SummaryContentPart = {
  type: ContentTypes.SUMMARY;
  content?: Array<{ type: ContentTypes.TEXT; text: string }>;
  tokenCount?: number;
  summarizing?: boolean;
  summaryVersion?: number;
  model?: string;
  provider?: string;
  createdAt?: string;
  boundary?: {
    messageId: string;
    contentIndex: number;
  };
};

/**
 * A user steering message injected mid-run at a tool-batch boundary.
 * Persisted inline in the response message's content array (keyed by the
 * type name like `text`/`think` so token counting reads it for free);
 * replayed as a user message on subsequent turns by `formatAgentMessages`.
 */
export type SteerContentPart = {
  type: ContentTypes.STEER;
  steer: string;
  steerId?: string;
  /** Stable optimistic-client id used to settle a POST whose response was lost. */
  clientSteerId?: string;
  createdAt?: number;
  /** Attachments steered with the message; re-encoded per turn on replay
   *  like any other user-message media (refs only, never encoded data). */
  files?: Partial<TFile>[];
  /** Quoted excerpts steered with the message, persisted separately from the
   *  typed text (mirroring `TMessage.quotes`) so the UI renders them as
   *  reference blocks; merged into the model-bound user turn on every replay. */
  quotes?: string[];
};

export type TMessageContentParts =
  | ({
      type: ContentTypes.ERROR;
      text?: string | TextData;
      error?: string;
    } & ContentMetadata)
  | ({
      type: ContentTypes.THINK;
      think?: string | TextData;
      /** Generated orientation for this user-visible reasoning step. */
      reasoning_label?: string;
      /** Stable SDK run-step identity used to correlate live revisions. */
      reasoning_label_step_id?: string;
      /** Durable provider-call count used to enforce the per-run cost cap across resumes. */
      reasoning_label_attempts?: number;
      /** Visible reasoning length included in this step's latest provider call. */
      reasoning_label_submitted_chars?: number;
      /** Monotonic provider-call revision; gaps are allowed after unsuccessful attempts. */
      reasoning_label_revision?: number;
      /** Whether the reasoning step can still produce a newer label. */
      reasoning_label_status?: 'streaming' | 'complete';
      /** The reasoning happened but its text is not available to this view
       *  (e.g. detached subagent projections retain only a marker). */
      reasoning_unavailable?: boolean;
    } & ContentMetadata)
  | (SteerContentPart & ContentMetadata)
  | ({
      type: ContentTypes.TEXT;
      text?: string | TextData;
      tool_call_ids?: string[];
      /** Open Responses semantic channel for assistant text. */
      phase?: 'commentary' | 'final_answer';
    } & ContentMetadata)
  | ({
      type: ContentTypes.TOOL_CALL;
      tool_call: (
        | CodeToolCall
        | RetrievalToolCall
        | FileSearchToolCall
        | FunctionToolCall
        | Agents.AgentToolCall
      ) &
        PartMetadata;
    } & ContentMetadata)
  | ({ type: ContentTypes.IMAGE_FILE; image_file: ImageFile & PartMetadata } & ContentMetadata)
  | (SummaryContentPart & ContentMetadata)
  | ({
      /** One-line LLM-generated note describing a completed tool batch. UI-only:
       *  never sent to the model (stripped before payload formatting). */
      type: ContentTypes.ACTIVITY_LABEL;
      activity_label?: string;
      /** Missing means the legacy/per-batch activity label. */
      activity_label_type?: 'phase';
      tool_call_ids?: string[];
      /** Parent phase bounds and telemetry. */
      activity_start_index?: number;
      /** Exclusive end of the grouped content; may precede the marker itself. */
      activity_end_index?: number;
      activity_count?: number;
      agent_ids?: string[];
      /** ok = all tools succeeded, failed = all failed, partial = mixed. */
      status?: 'ok' | 'partial' | 'failed';
      pending?: boolean;
    } & ContentMetadata)
  | (Agents.AgentUpdate & ContentMetadata)
  | (Agents.MessageContentImageUrl & ContentMetadata)
  | (Agents.MessageContentVideoUrl & ContentMetadata)
  | (Agents.MessageContentInputAudio & ContentMetadata)
  | (Agents.ElicitationContent & ContentMetadata);

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
/** Mirrors `Constants.mcp_delimiter`; duplicated here to avoid a circular import from `config.ts`. */
const mcpDelimiter = '_mcp_';

/**
 * Checks whether a tool name is an OpenAPI action tool.
 *
 * Action format: `operationId_action_normalizedDomain`
 * MCP format:    `toolName_mcp_serverName`
 *
 * Cross-delimiter collision: an MCP tool like `get_action_mcp_srv` contains
 * `_action_` as a false positive. Guarded by checking whether `_mcp_` appears
 * after `_action_`. In the collision case the `_mcp_` suffix always follows
 * `_action_`; in a valid action tool whose operationId contains `_mcp_`, the
 * `_mcp_` precedes `_action_`.
 *
 * Theoretical limitation: a non-RFC-compliant domain containing literal
 * underscores that form `_mcp_` (e.g. `api_mcp_internal.com`) would produce
 * a false negative. RFC 952/1123 prohibit underscores in hostnames, so this
 * is not expected in practice.
 */
export function isActionTool(toolName: string): boolean {
  const actionIdx = toolName.indexOf(actionDelimiter);
  if (actionIdx < 0) {
    return false;
  }
  const mcpIdx = toolName.indexOf(mcpDelimiter);
  return mcpIdx < 0 || mcpIdx < actionIdx;
}

export const hostImageIdSuffix = '_host_copy';
export const hostImageNamePrefix = 'host_copy_';

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
