/**
 * Open Responses API Module
 *
 * Exports for the Open Responses API implementation.
 * @see https://openresponses.org/specification
 */

// Types
export type {
  // Enums
  ItemStatus,
  ResponseStatus,
  MessageRole,
  ToolChoiceValue,
  TruncationValue,
  ServiceTier,
  ReasoningEffort,
  ReasoningSummary,
  // Input content
  InputTextContent,
  InputImageContent,
  InputFileContent,
  InputContent,
  // Output content
  LogProb,
  TopLogProb,
  OutputTextContent,
  RefusalContent,
  ModelContent,
  // Annotations
  UrlCitationAnnotation,
  FileCitationAnnotation,
  Annotation,
  // Reasoning content
  ReasoningTextContent,
  SummaryTextContent,
  ReasoningContent,
  // Input items
  SystemMessageItemParam,
  DeveloperMessageItemParam,
  UserMessageItemParam,
  AssistantMessageItemParam,
  FunctionCallItemParam,
  FunctionCallOutputItemParam,
  ReasoningItemParam,
  ItemReferenceParam,
  InputItem,
  // Output items
  MessageItem,
  FunctionCallItem,
  FunctionCallOutputItem,
  ReasoningItem,
  OutputItem,
  // Tools
  FunctionTool,
  HostedTool,
  Tool,
  FunctionToolChoice,
  ToolChoice,
  // Request
  ReasoningConfig,
  TextConfig,
  StreamOptions,
  Metadata,
  ResponseRequest,
  // Response field types
  TextField,
  // Response
  InputTokensDetails,
  OutputTokensDetails,
  Usage,
  IncompleteDetails,
  ResponseError,
  Response,
  // Streaming events
  BaseEvent,
  ResponseInProgressEvent,
  ResponseCompletedEvent,
  ResponseFailedEvent,
  ResponseIncompleteEvent,
  OutputItemAddedEvent,
  OutputItemDoneEvent,
  ContentPartAddedEvent,
  ContentPartDoneEvent,
  OutputTextDeltaEvent,
  OutputTextDoneEvent,
  RefusalDeltaEvent,
  RefusalDoneEvent,
  FunctionCallArgumentsDeltaEvent,
  FunctionCallArgumentsDoneEvent,
  ReasoningTextDeltaEvent,
  ReasoningTextDoneEvent,
  ErrorEvent,
  ResponseEvent,
  // Internal
  ResponseContext,
  RequestValidationResult,
} from './types';

// Handlers
export {
  // Tracker
  createResponseTracker,
  type ResponseTracker,
  // SSE
  writeEvent,
  writeDone,
  // Response building
  buildResponse,
  // Item builders
  generateItemId,
  createMessageItem,
  createFunctionCallItem,
  createFunctionCallOutputItem,
  createReasoningItem,
  createOutputTextContent,
  createReasoningTextContent,
  // Stream config
  type StreamHandlerConfig,
  // Response events
  emitResponseInProgress,
  emitResponseCompleted,
  emitResponseFailed,
  // Message events
  emitMessageItemAdded,
  emitMessageItemDone,
  emitTextContentPartAdded,
  emitOutputTextDelta,
  emitOutputTextDone,
  emitTextContentPartDone,
  // Function call events
  emitFunctionCallItemAdded,
  emitFunctionCallArgumentsDelta,
  emitFunctionCallArgumentsDone,
  emitFunctionCallItemDone,
  emitFunctionCallOutputItem,
  // Reasoning events
  emitReasoningItemAdded,
  emitReasoningContentPartAdded,
  emitReasoningTextDelta,
  emitReasoningTextDone,
  emitReasoningContentPartDone,
  emitReasoningItemDone,
  // Error events
  emitError,
  // Non-streaming
  buildResponsesNonStreamingResponse,
  updateTrackerUsage,
} from './handlers';

// Service
export {
  // Validation
  validateResponseRequest,
  isValidationFailure,
  // Input conversion
  convertInputToMessages,
  mergeMessagesWithInput,
  type InternalMessage,
  // Error response
  sendResponsesErrorResponse,
  // Context
  generateResponseId,
  createResponseContext,
  // Streaming setup
  setupStreamingResponse,
  // Event handlers
  createResponsesEventHandlers,
  // Non-streaming
  createResponseAggregator,
  buildAggregatedResponse,
  createAggregatorEventHandlers,
  type ResponseAggregator,
} from './service';
