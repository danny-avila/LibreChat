import type { TMessageContentParts, ContentMetadata, TextData, Text } from './types/content';
import type { TMessage, TAttachment } from './schemas';
import type { Agents } from './types/agents';
import type { TFile } from './types/files';
import { ContentTypes, ToolCallTypes } from './types/runs';
import { Tools } from './types/tools';

/**
 * A UI parts view of LibreChat message content, modelled on the AI SDK `UIMessage`.
 *
 * Matched against `ai@7.0.114` (`UIMessage`, `UIMessagePart`, `UIToolInvocation`) and
 * `@ai-sdk/react@4.0.117` (`useChat`). The shapes are structural copies, not imports: this
 * package does not depend on the AI SDK.
 *
 * Position invariant: `toUIParts(content)[i]` is the part for `content[i]`, holes included, so an
 * index-derived identity (the step index the stream reducers write to) survives the mapping.
 * A hole becomes a `step-start` part and maps back to a hole. Parts that have no content slot
 * (message files, web search sources) are appended after the last content part.
 */

/** Stream-only text chunk; never persisted, but it can appear in a message being built. */
export type TextDeltaContentPart = {
  type: ContentTypes.TEXT_DELTA;
  text?: string | TextData;
  text_delta?: string | TextData;
} & ContentMetadata;

/** Every content part the mapping accepts. */
export type MappableContentPart = TMessageContentParts | TextDeltaContentPart;

type ContentPartOf<T extends ContentTypes> = Extract<MappableContentPart, { type: T }>;
type ToolCallContentPart = ContentPartOf<ContentTypes.TOOL_CALL>;
type ToolCallValue = ToolCallContentPart['tool_call'];

/** AI SDK `providerMetadata`, keyed by provider; LibreChat keeps its own fields under one key. */
export type LibreChatProviderMetadata<T> = { librechat: T };

/** Fields of a `TextData` object other than its value, kept so the object form round-trips. */
type TextObjectFields = Omit<NonNullable<TextData>, 'value'>;

export type UITextPartMetadata = Omit<ContentPartOf<ContentTypes.TEXT>, 'type' | 'text'> & {
  textObject?: TextObjectFields;
};

export type UIReasoningPartMetadata = Omit<ContentPartOf<ContentTypes.THINK>, 'type' | 'think'> & {
  textObject?: TextObjectFields;
};

/** AI SDK `TextUIPart`. */
export type UITextPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: LibreChatProviderMetadata<UITextPartMetadata>;
};

/** AI SDK `ReasoningUIPart`. */
export type UIReasoningPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: LibreChatProviderMetadata<UIReasoningPartMetadata>;
};

/** The content part a `file` UI part was mapped from, when it came from content. */
export type UIFilePartMetadata =
  | ({ source: ContentTypes.IMAGE_FILE } & Omit<ContentPartOf<ContentTypes.IMAGE_FILE>, 'type'>)
  | ({ source: ContentTypes.IMAGE_URL; urlObject: boolean } & Omit<
      ContentPartOf<ContentTypes.IMAGE_URL>,
      'type' | 'image_url'
    > & { detail?: Agents.ImageDetail })
  | ({ source: ContentTypes.VIDEO_URL } & Omit<
      ContentPartOf<ContentTypes.VIDEO_URL>,
      'type' | 'video_url'
    >)
  | ({ source: ContentTypes.INPUT_AUDIO; format: string } & Omit<
      ContentPartOf<ContentTypes.INPUT_AUDIO>,
      'type' | 'input_audio'
    >);

/** AI SDK `FileUIPart`. Without `providerMetadata` it is a message attachment, not content. */
export type UIFilePart = {
  type: 'file';
  mediaType: string;
  filename?: string;
  url: string;
  providerMetadata?: LibreChatProviderMetadata<UIFilePartMetadata>;
};

/** AI SDK `SourceUrlUIPart`; built from web search attachments. */
export type UISourceUrlPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
};

/** AI SDK `StepStartUIPart`; stands in for a content slot no step has written yet. */
export type UIStepStartPart = { type: 'step-start' };

/** The subset of AI SDK tool states LibreChat content can express. */
export type UIToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

export type UIToolInput = Agents.ToolCall['args'] | object;
export type UIToolOutput = string | CodeInterpreterOutputs;
type CodeInterpreterOutputs = Extract<
  ToolCallValue,
  { type: 'code_interpreter' }
>['code_interpreter']['outputs'];

export type UIToolPartMetadata = Omit<ToolCallContentPart, 'type' | 'tool_call'> & {
  /** The call as stored, so the reverse mapping restores fields the UI part does not carry. */
  toolCall: ToolCallValue;
};

/**
 * AI SDK `ToolUIPart`: `tool-<name>` with a lifecycle `state`. Cancelled and failed steps both
 * surface as `output-error`; the exact run-step status stays on the stored call.
 */
export type UIToolPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: UIToolState;
  input?: UIToolInput;
  output?: UIToolOutput;
  errorText?: string;
  callProviderMetadata?: LibreChatProviderMetadata<UIToolPartMetadata>;
};

type DataOf<T extends ContentTypes> = Omit<ContentPartOf<T>, 'type'>;

/** AI SDK `DataUIPart`: LibreChat parts with no AI SDK counterpart, carried whole. */
export type UIDataPart =
  | { type: 'data-agent-update'; data: DataOf<ContentTypes.AGENT_UPDATE> }
  | { type: 'data-summary'; data: DataOf<ContentTypes.SUMMARY> }
  | { type: 'data-activity-label'; data: DataOf<ContentTypes.ACTIVITY_LABEL> }
  | { type: 'data-steer'; data: DataOf<ContentTypes.STEER> }
  | { type: 'data-error'; data: DataOf<ContentTypes.ERROR> };

/** AI SDK `UIMessagePart`, narrowed to what LibreChat content produces. */
export type UIMessagePart =
  | UITextPart
  | UIReasoningPart
  | UIToolPart
  | UIFilePart
  | UISourceUrlPart
  | UIStepStartPart
  | UIDataPart;

/** What a `TMessage` carries that `UIMessage` has no field for. */
export type UIMessageMetadata = Pick<
  TMessage,
  | 'conversationId'
  | 'parentMessageId'
  | 'sender'
  | 'model'
  | 'endpoint'
  | 'error'
  | 'unfinished'
  | 'createdAt'
> & {
  /** Set when the message had no `content`, so its parts were built from `text` and `files`. */
  contentless?: boolean;
  /** Agents that produced parts of this message, in order of first appearance. */
  agentIds?: string[];
  /** Parallel content groups present in this message, in order of first appearance. */
  groupIds?: number[];
  activityLabels?: DataOf<ContentTypes.ACTIVITY_LABEL>[];
  steers?: DataOf<ContentTypes.STEER>[];
  summaries?: DataOf<ContentTypes.SUMMARY>[];
};

/** AI SDK `UIMessage`. */
export type UIMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: UIMessageMetadata;
  parts: UIMessagePart[];
};

type DataPartType = UIDataPart['type'];

const dataPartTypes = {
  [ContentTypes.AGENT_UPDATE]: 'data-agent-update',
  [ContentTypes.SUMMARY]: 'data-summary',
  [ContentTypes.ACTIVITY_LABEL]: 'data-activity-label',
  [ContentTypes.STEER]: 'data-steer',
  [ContentTypes.ERROR]: 'data-error',
} as const satisfies Partial<Record<ContentTypes, DataPartType>>;

const contentTypesByDataPart: Record<DataPartType, keyof typeof dataPartTypes> = {
  'data-agent-update': ContentTypes.AGENT_UPDATE,
  'data-summary': ContentTypes.SUMMARY,
  'data-activity-label': ContentTypes.ACTIVITY_LABEL,
  'data-steer': ContentTypes.STEER,
  'data-error': ContentTypes.ERROR,
};

const stepStart: UIStepStartPart = { type: 'step-start' };

export const isUIToolPart = (part: UIMessagePart): part is UIToolPart =>
  part.type.startsWith('tool-');

export const isUIDataPart = (part: UIMessagePart): part is UIDataPart =>
  part.type.startsWith('data-');

const hasKeys = (value: object) => Object.keys(value).length > 0;

const withLibreChatMetadata = <P extends object, M extends object>(part: P, metadata: M) =>
  hasKeys(metadata) ? { ...part, providerMetadata: { librechat: metadata } } : part;

const splitText = (
  text: string | TextData | undefined,
): { value: string; textObject?: TextObjectFields } => {
  if (text == null || typeof text === 'string') {
    return { value: text ?? '' };
  }
  const { value, ...textObject } = text;
  return { value: value ?? '', textObject };
};

const joinText = (value: string, textObject?: TextObjectFields): string | Text =>
  textObject ? { ...textObject, value } : value;

const parseToolInput = (args: UIToolInput | undefined) => {
  if (typeof args !== 'string') {
    return { input: args, complete: args != null };
  }
  try {
    return { input: JSON.parse(args) as UIToolInput, complete: true };
  } catch {
    return { input: args, complete: false };
  }
};

type ToolCallFields = { name: string; id?: string; args?: UIToolInput; output?: UIToolOutput };

const readToolCall = (toolCall: ToolCallValue): ToolCallFields => {
  switch (toolCall.type) {
    case 'function':
      return {
        name: toolCall.function.name,
        id: toolCall.id,
        args: toolCall.function.arguments,
        output: toolCall.function.output ?? undefined,
      };
    case 'code_interpreter':
      return {
        name: toolCall.type,
        id: toolCall.id,
        args: toolCall.code_interpreter.input,
        output: toolCall.code_interpreter.outputs,
      };
    case 'retrieval':
    case 'file_search':
      return { name: toolCall.type, id: toolCall.id };
    default:
      return {
        name: toolCall.name,
        id: toolCall.id ?? toolCall.stepId,
        args: toolCall.args,
        output: toolCall.output,
      };
  }
};

const toToolPart = (part: ToolCallContentPart, index: number): UIToolPart => {
  const { tool_call: toolCall, type: _type, ...partMetadata } = part;
  const { name, id, args, output } = readToolCall(toolCall);
  const { input, complete } = parseToolInput(args);
  const { runStepStatus, progress } = toolCall;
  const failed = runStepStatus === 'failed' || runStepStatus === 'cancelled';
  const hasOutput = output != null && output !== '';

  let state: UIToolState = complete ? 'input-available' : 'input-streaming';
  if (failed) {
    state = 'output-error';
  } else if (hasOutput || runStepStatus === 'completed' || (progress ?? 0) >= 1) {
    state = 'output-available';
  }

  return {
    type: `tool-${name}`,
    toolCallId: id ?? `${ContentTypes.TOOL_CALL}-${index}`,
    state,
    ...(input !== undefined && { input }),
    ...(state === 'output-available' && output !== undefined && { output }),
    ...(state === 'output-error' && {
      errorText: typeof output === 'string' && output ? output : runStepStatus,
    }),
    callProviderMetadata: { librechat: { ...partMetadata, toolCall } },
  };
};

const toDataPart = (part: ContentPartOf<keyof typeof dataPartTypes>): UIDataPart => {
  const { type, ...data } = part;
  return { type: dataPartTypes[type], data } as UIDataPart;
};

/**
 * Maps one content part to its UI part. A missing part (a hole in a streamed array) maps to
 * `step-start`, so indexes line up with the content array.
 */
export function toUIPart(part: MappableContentPart | null | undefined, index = 0): UIMessagePart {
  if (part == null) {
    return stepStart;
  }
  switch (part.type) {
    case ContentTypes.TEXT: {
      const { type: _type, text, ...rest } = part;
      const { value, textObject } = splitText(text);
      return withLibreChatMetadata(
        { type: 'text', text: value } satisfies UITextPart,
        textObject ? { ...rest, textObject } : rest,
      );
    }
    case ContentTypes.TEXT_DELTA: {
      const { value } = splitText(part.text_delta ?? part.text);
      return { type: 'text', text: value, state: 'streaming' };
    }
    case ContentTypes.THINK: {
      const { type: _type, think, ...rest } = part;
      const { value, textObject } = splitText(think);
      return withLibreChatMetadata(
        { type: 'reasoning', text: value } satisfies UIReasoningPart,
        textObject ? { ...rest, textObject } : rest,
      );
    }
    case ContentTypes.TOOL_CALL:
      return toToolPart(part, index);
    case ContentTypes.IMAGE_FILE: {
      const { type: _type, ...rest } = part;
      const { image_file: imageFile } = rest;
      return {
        type: 'file',
        mediaType: imageFile.type || 'image/*',
        filename: imageFile.filename,
        url: imageFile.filepath,
        providerMetadata: { librechat: { source: ContentTypes.IMAGE_FILE, ...rest } },
      };
    }
    case ContentTypes.IMAGE_URL: {
      const { type: _type, image_url: imageUrl, ...rest } = part;
      const urlObject = typeof imageUrl !== 'string';
      const detail = urlObject ? imageUrl.detail : undefined;
      return {
        type: 'file',
        mediaType: 'image/*',
        url: urlObject ? imageUrl.url : imageUrl,
        providerMetadata: {
          librechat: {
            source: ContentTypes.IMAGE_URL,
            urlObject,
            ...(detail !== undefined && { detail }),
            ...rest,
          },
        },
      };
    }
    case ContentTypes.VIDEO_URL: {
      const { type: _type, video_url: videoUrl, ...rest } = part;
      return {
        type: 'file',
        mediaType: 'video/*',
        url: videoUrl.url,
        providerMetadata: { librechat: { source: ContentTypes.VIDEO_URL, ...rest } },
      };
    }
    case ContentTypes.INPUT_AUDIO: {
      const { type: _type, input_audio: audio, ...rest } = part;
      return {
        type: 'file',
        mediaType: `audio/${audio.format}`,
        url: `data:audio/${audio.format};base64,${audio.data}`,
        providerMetadata: {
          librechat: { source: ContentTypes.INPUT_AUDIO, format: audio.format, ...rest },
        },
      };
    }
    case ContentTypes.AGENT_UPDATE:
    case ContentTypes.SUMMARY:
    case ContentTypes.ACTIVITY_LABEL:
    case ContentTypes.STEER:
    case ContentTypes.ERROR:
      return toDataPart(part);
  }
}

/** Maps a content array to UI parts, one per slot, holes included. */
export function toUIParts(content: ReadonlyArray<MappableContentPart | null | undefined>) {
  const parts: UIMessagePart[] = new Array(content.length);
  for (let i = 0; i < content.length; i++) {
    parts[i] = toUIPart(content[i], i);
  }
  return parts;
}

const fromFilePart = (
  part: UIFilePart,
  metadata: UIFilePartMetadata,
): TMessageContentParts | undefined => {
  switch (metadata.source) {
    case ContentTypes.IMAGE_FILE: {
      const { source: _source, ...rest } = metadata;
      return { type: ContentTypes.IMAGE_FILE, ...rest };
    }
    case ContentTypes.IMAGE_URL: {
      const { source: _source, urlObject, detail, ...rest } = metadata;
      const url = part.url;
      const imageUrl = urlObject ? { url, ...(detail !== undefined && { detail }) } : url;
      return { type: ContentTypes.IMAGE_URL, image_url: imageUrl, ...rest };
    }
    case ContentTypes.VIDEO_URL: {
      const { source: _source, ...rest } = metadata;
      return { type: ContentTypes.VIDEO_URL, video_url: { url: part.url }, ...rest };
    }
    case ContentTypes.INPUT_AUDIO: {
      const { source: _source, format, ...rest } = metadata;
      const data = part.url.slice(part.url.indexOf(',') + 1);
      return { type: ContentTypes.INPUT_AUDIO, input_audio: { data, format }, ...rest };
    }
  }
};

const fromToolPart = (part: UIToolPart): TMessageContentParts => {
  const stored = part.callProviderMetadata?.librechat;
  if (stored) {
    const { toolCall, ...partMetadata } = stored;
    return { type: ContentTypes.TOOL_CALL, tool_call: toolCall, ...partMetadata };
  }
  const output = typeof part.output === 'string' ? part.output : part.errorText;
  return {
    type: ContentTypes.TOOL_CALL,
    tool_call: {
      type: ToolCallTypes.TOOL_CALL,
      name: part.type.slice('tool-'.length),
      id: part.toolCallId,
      ...(part.input !== undefined && {
        args: typeof part.input === 'string' ? part.input : JSON.stringify(part.input),
      }),
      ...(output !== undefined && { output }),
    },
  };
};

/**
 * Maps a UI part back to content. Returns `undefined` for parts with no content slot:
 * `step-start` (a hole), `source-url`, and `file` parts that are message attachments.
 *
 * Lossless for every part `toUIPart` produced except `text_delta`, which comes back as `text`.
 * A tool part restores the stored call as it was, so edits to `input`/`output` on a mapped
 * tool part are not written back; a tool part built by hand becomes an agents tool call.
 */
export function fromUIPart(part: UIMessagePart): TMessageContentParts | undefined {
  switch (part.type) {
    case 'text': {
      const { textObject, ...rest } = part.providerMetadata?.librechat ?? {};
      return { type: ContentTypes.TEXT, text: joinText(part.text, textObject), ...rest };
    }
    case 'reasoning': {
      const { textObject, ...rest } = part.providerMetadata?.librechat ?? {};
      return { type: ContentTypes.THINK, think: joinText(part.text, textObject), ...rest };
    }
    case 'file':
      return part.providerMetadata
        ? fromFilePart(part, part.providerMetadata.librechat)
        : undefined;
    case 'step-start':
    case 'source-url':
      return undefined;
  }
  if (isUIDataPart(part)) {
    return { type: contentTypesByDataPart[part.type], ...part.data } as TMessageContentParts;
  }
  return fromToolPart(part);
}

/** Maps UI parts back to a content array; `step-start` parts become holes again. */
export function fromUIParts(parts: ReadonlyArray<UIMessagePart>): TMessageContentParts[] {
  const content: TMessageContentParts[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const mapped = fromUIPart(part);
    if (mapped) {
      content[i] = mapped;
    } else if (part.type === 'step-start') {
      content.length = i + 1;
    }
  }
  return content;
}

const toAttachmentFilePart = (file: Partial<TFile>): UIFilePart | undefined => {
  if (!file.filepath) {
    return undefined;
  }
  return {
    type: 'file',
    mediaType: file.type || 'application/octet-stream',
    ...(file.filename && { filename: file.filename }),
    url: file.filepath,
  };
};

const toSourceParts = (attachment: TAttachment): UISourceUrlPart[] => {
  const results = attachment[Tools.web_search];
  if (!results) {
    return [];
  }
  const sources = [...(results.organic ?? []), ...(results.topStories ?? [])];
  return sources.map((source, i) => ({
    type: 'source-url',
    sourceId: `${attachment.toolCallId}-${i}`,
    url: source.link,
    ...(source.title && { title: source.title }),
  }));
};

const pushUnique = <T>(seen: Set<T>, value: T | undefined) => {
  if (value !== undefined) {
    seen.add(value);
  }
};

/**
 * A `UIMessage` view of a `TMessage`: content parts in content order, then attachment files,
 * then web search sources. A message without `content` gets one text part from `text`.
 * One pass over the content builds both the parts and the metadata.
 */
export function toUIMessage(message: TMessage): UIMessage {
  const content = message.content;
  const parts: UIMessagePart[] = [];
  const agentIds = new Set<string>();
  const groupIds = new Set<number>();
  const activityLabels: UIMessageMetadata['activityLabels'] = [];
  const steers: UIMessageMetadata['steers'] = [];
  const summaries: UIMessageMetadata['summaries'] = [];

  if (content) {
    for (let i = 0; i < content.length; i++) {
      const part = content[i] as MappableContentPart | undefined;
      const uiPart = toUIPart(part, i);
      parts.push(uiPart);
      if (part == null) {
        continue;
      }
      pushUnique(agentIds, part.agentId);
      pushUnique(groupIds, part.groupId);
      if (uiPart.type === 'data-agent-update') {
        pushUnique(agentIds, uiPart.data.agent_update.agentId);
      } else if (uiPart.type === 'data-activity-label') {
        activityLabels.push(uiPart.data);
      } else if (uiPart.type === 'data-steer') {
        steers.push(uiPart.data);
      } else if (uiPart.type === 'data-summary') {
        summaries.push(uiPart.data);
      }
    }
  } else {
    parts.push({ type: 'text', text: message.text ?? '' });
  }

  for (const file of message.files ?? []) {
    const filePart = toAttachmentFilePart(file);
    if (filePart) {
      parts.push(filePart);
    }
  }
  for (const attachment of message.attachments ?? []) {
    parts.push(...toSourceParts(attachment));
  }

  const metadata: UIMessageMetadata = {
    conversationId: message.conversationId,
    parentMessageId: message.parentMessageId,
    ...(message.sender !== undefined && { sender: message.sender }),
    ...(message.model != null && { model: message.model }),
    ...(message.endpoint !== undefined && { endpoint: message.endpoint }),
    ...(message.error !== undefined && { error: message.error }),
    ...(message.unfinished !== undefined && { unfinished: message.unfinished }),
    ...(message.createdAt !== undefined && { createdAt: message.createdAt }),
    ...(!content && { contentless: true }),
    ...(agentIds.size > 0 && { agentIds: Array.from(agentIds) }),
    ...(groupIds.size > 0 && { groupIds: Array.from(groupIds) }),
    ...(activityLabels.length > 0 && { activityLabels }),
    ...(steers.length > 0 && { steers }),
    ...(summaries.length > 0 && { summaries }),
  };

  return {
    id: message.messageId,
    role: message.isCreatedByUser ? 'user' : 'assistant',
    metadata,
    parts,
  };
}

/**
 * Maps a `UIMessage` back onto a `TMessage`. `base` is the stored message with the same id,
 * whose fields the UI view does not carry (tree position, files, feedback, token counts) are
 * kept; without one the message is rebuilt from the view alone.
 */
export function fromUIMessage(message: UIMessage, base?: TMessage): TMessage {
  const metadata = message.metadata;
  const text = message.parts.reduce(
    (joined, part) => (part.type === 'text' ? joined + part.text : joined),
    '',
  );
  const next: TMessage = {
    ...base,
    messageId: message.id,
    isCreatedByUser: message.role === 'user',
    conversationId: metadata?.conversationId ?? base?.conversationId ?? null,
    parentMessageId: metadata?.parentMessageId ?? base?.parentMessageId ?? null,
    text: metadata?.contentless ? text : (base?.text ?? text),
  };
  if (!metadata?.contentless) {
    next.content = fromUIParts(message.parts);
  }
  if (!base) {
    const files = message.parts
      .filter((part): part is UIFilePart => part.type === 'file' && !part.providerMetadata)
      .map((part) => ({ filepath: part.url, filename: part.filename, type: part.mediaType }));
    if (files.length > 0) {
      next.files = files;
    }
  }
  return next;
}
