/* eslint-disable @typescript-eslint/no-namespace */
import { StepTypes, ContentTypes, ToolCallTypes } from './runs';
import type { TAttachment, TPlugin } from 'src/schemas';
import type { FunctionToolCall } from './assistants';

export namespace Agents {
  export type MessageType = 'human' | 'ai' | 'generic' | 'system' | 'function' | 'tool' | 'remove';

  export type ImageDetail = 'auto' | 'low' | 'high';

  export type ReasoningContentText = {
    type: ContentTypes.THINK;
    think: string;
  };

  export type MessageContentText = {
    type: ContentTypes.TEXT;
    text: string;
    tool_call_ids?: string[];
  };

  export type AgentUpdate = {
    type: ContentTypes.AGENT_UPDATE;
    agent_update: {
      index: number;
      runId: string;
      agentId: string;
    };
  };

  export type MessageContentImageUrl = {
    type: ContentTypes.IMAGE_URL;
    image_url: string | { url: string; detail?: ImageDetail };
  };

  export type MessageContentComplex =
    | ReasoningContentText
    | AgentUpdate
    | MessageContentText
    | MessageContentImageUrl
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | (Record<string, any> & { type?: ContentTypes | string })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | (Record<string, any> & { type?: never });

  export type MessageContent = string | MessageContentComplex[];

  /**
   * A call to a tool.
   */
  export type ToolCall = {
    /** Type ("tool_call") according to Assistants Tool Call Structure */
    type: ToolCallTypes.TOOL_CALL;
    /** The name of the tool to be called */
    name: string;

    /** The arguments to the tool call */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: string | Record<string, any>;

    /** If provided, an identifier associated with the tool call */
    id?: string;
    /** If provided, the output of the tool call */
    output?: string;
    /** Auth URL */
    auth?: string;
    /** Expiration time */
    expires_at?: number;
  };

  export type ToolEndEvent = {
    /** The Step Id of the Tool Call */
    id: string;
    /** The Completed Tool Call */
    tool_call?: ToolCall;
    /** The content index of the tool call */
    index: number;
  };

  export type ToolCallContent = {
    type: ContentTypes.TOOL_CALL;
    tool_call?: ToolCall;
  };

  /**
   * A chunk of a tool call (e.g., as part of a stream).
   * When merging ToolCallChunks (e.g., via AIMessageChunk.__add__),
   * all string attributes are concatenated. Chunks are only merged if their
   * values of `index` are equal and not None.
   *
   * @example
   * ```ts
   * const leftChunks = [
   *   {
   *     name: "foo",
   *     args: '{"a":',
   *     index: 0
   *   }
   * ];
   *
   * const leftAIMessageChunk = new AIMessageChunk({
   *   content: "",
   *   tool_call_chunks: leftChunks
   * });
   *
   * const rightChunks = [
   *   {
   *     name: undefined,
   *     args: '1}',
   *     index: 0
   *   }
   * ];
   *
   * const rightAIMessageChunk = new AIMessageChunk({
   *   content: "",
   *   tool_call_chunks: rightChunks
   * });
   *
   * const result = leftAIMessageChunk.concat(rightAIMessageChunk);
   * // result.tool_call_chunks is equal to:
   * // [
   * //   {
   * //     name: "foo",
   * //     args: '{"a":1}'
   * //     index: 0
   * //   }
   * // ]
   * ```
   *
   * @property {string} [name] - If provided, a substring of the name of the tool to be called
   * @property {string} [args] - If provided, a JSON substring of the arguments to the tool call
   * @property {string} [id] - If provided, a substring of an identifier for the tool call
   * @property {number} [index] - If provided, the index of the tool call in a sequence
   */
  export type ToolCallChunk = {
    name?: string;

    args?: string;

    id?: string;

    index?: number;

    type?: 'tool_call_chunk';
  };

  /** Event names are of the format: on_[runnable_type]_(start|stream|end).

  Runnable types are one of:

  llm - used by non chat models
  chat_model - used by chat models
  prompt -- e.g., ChatPromptTemplate
  tool -- LangChain tools
  chain - most Runnables are of this type
  Further, the events are categorized as one of:

  start - when the runnable starts
  stream - when the runnable is streaming
  end - when the runnable ends
  start, stream and end are associated with slightly different data payload.

  Please see the documentation for EventData for more details. */
  export type EventName = string;
  export type RunStep = {
    type: StepTypes;
    id: string; // #new
    runId?: string; // #new
    index: number; // #new
    stepIndex?: number; // #new
    stepDetails: StepDetails;
    usage: null | object;
  };
  /**
   * Represents a run step delta i.e. any changed fields on a run step during
   * streaming.
   */
  export interface RunStepDeltaEvent {
    /**
     * The identifier of the run step, which can be referenced in API endpoints.
     */
    id: string;
    /**
     * The delta containing the fields that have changed on the run step.
     */
    delta: ToolCallDelta;
  }
  export type StepDetails = MessageCreationDetails | ToolCallsDetails;
  export type MessageCreationDetails = {
    type: StepTypes.MESSAGE_CREATION;
    message_creation: {
      message_id: string;
    };
  };
  export type ToolCallsDetails = {
    type: StepTypes.TOOL_CALLS;
    tool_calls: AgentToolCall[];
  };
  export type ToolCallDelta = {
    type: StepTypes.TOOL_CALLS | string;
    tool_calls?: ToolCallChunk[];
    auth?: string;
    expires_at?: number;
  };
  export type AgentToolCall = FunctionToolCall | ToolCall;
  export interface ExtendedMessageContent {
    type?: string;
    text?: string;
    input?: string;
    index?: number;
    id?: string;
    name?: string;
  }
  /**
   * Represents a message delta i.e. any changed fields on a message during
   * streaming.
   */
  export interface MessageDeltaEvent {
    /**
     * The identifier of the message, which can be referenced in API endpoints.
     */
    id: string;
    /**
     * The delta containing the fields that have changed on the Message.
     */
    delta: MessageDelta;
  }
  /**
   * The delta containing the fields that have changed on the Message.
   */
  export interface MessageDelta {
    /**
     * The content of the message in array of text and/or images.
     */
    content?: Agents.MessageContentComplex[];
  }

  /**
   * Represents a reasoning delta i.e. any changed fields on a message during
   * streaming.
   */
  export interface ReasoningDeltaEvent {
    /**
     * The identifier of the message, which can be referenced in API endpoints.
     */
    id: string;

    /**
     * The delta containing the fields that have changed.
     */
    delta: ReasoningDelta;
  }

  /**
   * The reasoning delta containing the fields that have changed on the Message.
   */
  export interface ReasoningDelta {
    /**
     * The content of the message in array of text and/or images.
     */
    content?: MessageContentComplex[];
  }

  export type ReasoningDeltaUpdate = { type: ContentTypes.THINK; think: string };
  export type ContentType =
    | ContentTypes.THINK
    | ContentTypes.TEXT
    | ContentTypes.IMAGE_URL
    | string;
}

export type ToolCallResult = {
  user: string;
  toolId: string;
  result?: unknown;
  messageId: string;
  partIndex?: number;
  blockIndex?: number;
  conversationId: string;
  attachments?: TAttachment[];
};

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

export type Action = {
  action_id: string;
  type?: string;
  settings?: Record<string, unknown>;
  metadata: ActionMetadata;
  version: number | string;
} & ({ assistant_id: string; agent_id?: never } | { assistant_id?: never; agent_id: string });

export type ActionMetadata = {
  api_key?: string;
  auth?: ActionAuth;
  domain?: string;
  privacy_policy_url?: string;
  raw_spec?: string;
  oauth_client_id?: string;
  oauth_client_secret?: string;
};

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

export type ActionMetadataRuntime = ActionMetadata & {
  oauth_access_token?: string;
  oauth_refresh_token?: string;
  oauth_token_expires_at?: Date;
};

export type MCP = {
  mcp_id: string;
  metadata: MCPMetadata;
} & ({ assistant_id: string; agent_id?: never } | { assistant_id?: never; agent_id?: string });

export type MCPMetadata = Omit<ActionMetadata, 'auth'> & {
  name?: string;
  description?: string;
  url?: string;
  tools?: string[];
  auth?: MCPAuth;
  icon?: string;
  trust?: boolean;
};

export type MCPAuth = ActionAuth;

export type AgentToolType = {
  tool_id: string;
  metadata: ToolMetadata;
} & ({ assistant_id: string; agent_id?: never } | { assistant_id?: never; agent_id?: string });

export type ToolMetadata = TPlugin;

export interface BaseMessage {
  content: string;
  role?: string;
  [key: string]: unknown;
}

export interface BaseGraphState {
  [key: string]: unknown;
}

export type GraphEdge = {
  /** Agent ID, use a list for multiple sources */
  from: string | string[];
  /** Agent ID, use a list for multiple destinations */
  to: string | string[];
  description?: string;
  /** Can return boolean or specific destination(s) */
  condition?: (state: BaseGraphState) => boolean | string | string[];
  /** 'handoff' creates tools for dynamic routing, 'direct' creates direct edges, which also allow parallel execution */
  edgeType?: 'handoff' | 'direct';
  /**
   * For direct edges: Optional prompt to add when transitioning through this edge.
   * String prompts can include variables like {results} which will be replaced with
   * messages from startIndex onwards. When {results} is used, excludeResults defaults to true.
   *
   * For handoff edges: Description for the input parameter that the handoff tool accepts,
   * allowing the supervisor to pass specific instructions/context to the transferred agent.
   */
  prompt?: string | ((messages: BaseMessage[], runStartIndex: number) => string | undefined);
  /**
   * When true, excludes messages from startIndex when adding prompt.
   * Automatically set to true when {results} variable is used in prompt.
   */
  excludeResults?: boolean;
  /**
   * For handoff edges: Customizes the parameter name for the handoff input.
   * Defaults to "instructions" if not specified.
   * Only applies when prompt is provided for handoff edges.
   */
  promptKey?: string;
};
