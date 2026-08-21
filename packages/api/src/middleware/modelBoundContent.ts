import { StreamLimitExceededError } from '@librechat/agents';
import {
  HITL_MESSAGE_FILTER_FIELDS,
  hasActivePiiFields,
  hasActivePiiPatterns,
} from 'librechat-data-provider';
import type {
  FiltersConfig,
  MessageFilterPiiConfig,
  UserSubmittedMessageFieldPath,
} from 'librechat-data-provider';
import type {
  AgentContentInput,
  AssistantActionContentInput,
  AssistantContentInput,
  FileContentInput,
  MemoryContentInput,
  SkillContentInput,
  StoredMessageContentInput,
} from '../protection/adapters/submissions';
import type { JsonPointer, TextContentFragment } from '../protection/types';
import type { ExternalChatMessage } from '../protection/adapters/messages';
import type { CanonicalFileInspectionFile } from '../protection/files';
import {
  allowHydratedFileReferences,
  assertHydratedFileInspectable,
  hasActiveFilePolicy,
  getBlockedOpaqueFileField,
  getBlockedUninspectableFileField,
  omitResolvedCanonicalFileLocators,
  UninspectableFileError,
} from '../protection/files';
import {
  extractAgentContent,
  extractAssistantActionContent,
  extractAssistantContent,
  extractFileContent,
  extractMemoryContent,
  extractSkillContent,
  extractStoredMessageContent,
} from '../protection/adapters/submissions';
import {
  getContentTraversalFragments,
  isContentTraversalProtected,
  isContentTraversalLimitError,
  isNestedMessageTraversalProtected,
} from '../protection/adapters/nested';
import {
  getSafeUserSubmittedPathSegments,
  getUserSubmittedMessageFieldPathState,
  getUserSubmittedPathState,
} from '../protection/provenance';
import { ContentTraversalLimitError } from '../protection/adapters/nested';
import { ContentFilterError, isContentFilterError } from './contentFilter';
import { createConfiguredContentInspector } from '../protection/runtime';
import { extractMessageContent } from '../protection/adapters/messages';

export type ModelBoundProviderMessage = ExternalChatMessage &
  Omit<StoredMessageContentInput, 'content'> & {
    readonly id?: string;
    readonly messageId?: string;
    readonly text?: string;
    readonly additional_kwargs?: {
      readonly injected?: boolean;
      readonly isMeta?: boolean;
      readonly source?: string;
      readonly sourceMessageId?: string;
      readonly sourceMessageIds?: readonly string[];
    };
    readonly _getType?: () => string;
  };

type ModelBoundMessage = ExternalChatMessage & {
  readonly _getType?: () => string;
};

type StoredModelBoundMessage = StoredMessageContentInput & {
  readonly id?: string;
  readonly messageId?: string;
  readonly isCreatedByUser?: boolean;
  readonly isUserSubmitted?: boolean;
  readonly userSubmittedPaths?: readonly string[];
  readonly userSubmittedMessageFieldPaths?: readonly UserSubmittedMessageFieldPath[];
};

type ModelBoundCanonicalFile = FileContentInput & CanonicalFileInspectionFile;

type ModelBoundPolicyError =
  | ContentFilterError
  | ContentTraversalLimitError
  | UninspectableFileError;

/**
 * Compatibility bridge for @librechat/agents 3.6.9. Its summarization,
 * fallback, and subagent recovery paths intentionally rethrow stream-safety
 * errors but recover from ordinary model callback errors. A provider-bound
 * policy rejection is likewise non-recoverable, so wrapping it in the one
 * fatal class understood by that SDK keeps every execution path fail-closed.
 * Remove this bridge once the SDK exposes a generic fatal callback error.
 */
class FatalModelBoundPolicyError extends StreamLimitExceededError {
  public readonly code: ModelBoundPolicyError['code'];
  public readonly statusCode: ModelBoundPolicyError['statusCode'];
  public readonly body: ModelBoundPolicyError['body'];
  public override readonly cause: ModelBoundPolicyError;

  constructor(error: ModelBoundPolicyError) {
    super({ kind: 'delta_events', limit: 0, observed: 0 });
    this.name = error.name;
    this.message = error.message;
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.body = error.body;
    this.cause = error;
    Object.setPrototypeOf(this, FatalModelBoundPolicyError.prototype);
  }
}

export interface ModelBoundProviderContentInput {
  readonly filters?: FiltersConfig;
  readonly legacyPii?: MessageFilterPiiConfig;
  readonly providerMessages: readonly ModelBoundProviderMessage[];
  readonly storedMessages?: readonly (StoredModelBoundMessage | null | undefined)[];
  readonly resolvedFiles?: readonly (ModelBoundCanonicalFile | null | undefined)[];
  /** Canonical files actually materialized for each persisted source row. */
  readonly fileIdsBySourceMessageId?: ReadonlyMap<string, readonly string[]>;
}

type ModelBoundFileReference = { readonly file_id?: string } | null | undefined;

export interface ModelBoundSourceFileInput {
  readonly messageFilesBySourceMessageId?: Readonly<
    Record<string, readonly ModelBoundFileReference[] | null | undefined>
  >;
  readonly steerFileIdsBySourceMessageId?: ReadonlyMap<string, Iterable<string>>;
  readonly replayHistoricalFiles: boolean;
  readonly historicalFiles?: Iterable<ModelBoundCanonicalFile | null | undefined>;
  readonly processedCurrentFiles?: Iterable<ModelBoundCanonicalFile | null | undefined>;
  readonly canonicalCurrentFiles?: Iterable<ModelBoundCanonicalFile | null | undefined>;
}

export interface ModelBoundSourceFileProjection {
  readonly fileIdsBySourceMessageId: ReadonlyMap<string, readonly string[]>;
  readonly resolvedFiles: readonly ModelBoundCanonicalFile[];
}

/** Collects every provider-supported persisted file locator for owner hydration. */
export function collectModelBoundHistoricalFileIds(
  messages: readonly (StoredMessageContentInput | null | undefined)[],
): string[] {
  const fileIds = new Set<string>();
  const appendReferences = (
    references: readonly ModelBoundFileReference[] | null | undefined,
  ): void => {
    for (const reference of references ?? []) {
      if (typeof reference?.file_id !== 'string') {
        continue;
      }
      const fileId = reference.file_id.trim();
      if (fileId.length > 0) {
        fileIds.add(fileId);
      }
    }
  };
  for (const message of messages) {
    if (message == null) {
      continue;
    }
    appendReferences(message.files);
    appendReferences(message.attachments);
    for (const part of message.content ?? []) {
      if (part == null) {
        continue;
      }
      appendReferences(part.files);
      appendReferences(part.image_file == null ? undefined : [part.image_file]);
      appendReferences(part.file == null ? undefined : [part.file]);
      if (typeof part.file_id === 'string') {
        appendReferences([{ file_id: part.file_id }]);
      }
    }
  }
  return [...fileIds];
}

/**
 * Builds the security-sensitive provider source/file association in typed
 * backend code. Legacy clients supply runtime state only; this helper owns
 * source normalization, deduplication, replay selection, and canonical-row
 * precedence for the final model-bound guard.
 */
export function projectModelBoundSourceFiles(
  input: ModelBoundSourceFileInput,
): ModelBoundSourceFileProjection {
  const fileIdsBySourceMessageId = new Map<string, Set<string>>();
  const appendFileIds = (
    sourceMessageId: string,
    files: Iterable<string | ModelBoundFileReference>,
  ): void => {
    const normalizedSourceId = sourceMessageId.trim();
    if (normalizedSourceId.length === 0) {
      return;
    }
    const fileIds = fileIdsBySourceMessageId.get(normalizedSourceId) ?? new Set<string>();
    for (const file of files) {
      const candidate = typeof file === 'string' ? file : file?.file_id;
      if (typeof candidate !== 'string') {
        continue;
      }
      const fileId = candidate.trim();
      if (fileId.length > 0) {
        fileIds.add(fileId);
      }
    }
    if (fileIds.size > 0) {
      fileIdsBySourceMessageId.set(normalizedSourceId, fileIds);
    }
  };

  for (const [sourceMessageId, files] of Object.entries(
    input.messageFilesBySourceMessageId ?? {},
  )) {
    appendFileIds(sourceMessageId, files ?? []);
  }
  for (const [sourceMessageId, fileIds] of input.steerFileIdsBySourceMessageId ?? []) {
    appendFileIds(sourceMessageId, fileIds);
  }

  const resolvedFilesById = new Map<string, ModelBoundCanonicalFile>();
  const appendResolvedFiles = (
    files: Iterable<ModelBoundCanonicalFile | null | undefined> | undefined,
  ): void => {
    for (const file of files ?? []) {
      if (typeof file?.file_id !== 'string') {
        continue;
      }
      const fileId = file.file_id.trim();
      if (fileId.length > 0) {
        resolvedFilesById.set(fileId, file);
      }
    }
  };
  if (input.replayHistoricalFiles) {
    appendResolvedFiles(input.historicalFiles);
  }
  appendResolvedFiles(input.processedCurrentFiles);
  /** Canonical current rows come last so OCR/extraction coverage survives
   * provider encoding that intentionally reduces transport metadata. */
  appendResolvedFiles(input.canonicalCurrentFiles);

  return {
    fileIdsBySourceMessageId: new Map(
      [...fileIdsBySourceMessageId].map(([sourceMessageId, fileIds]) => [
        sourceMessageId,
        [...fileIds],
      ]),
    ),
    resolvedFiles: [...resolvedFilesById.values()],
  };
}

export interface ModelBoundChatModelCallback {
  readonly name: 'librechat-model-bound-content-filter';
  readonly raiseError: true;
  readonly awaitHandlers: true;
  readonly handleChatModelStart: (
    llm: object | undefined,
    messageBatches: readonly (readonly ModelBoundProviderMessage[])[],
  ) => void;
}

export interface InitialModelBoundAdmissionCallback {
  readonly name: 'librechat-initial-model-bound-admission';
  readonly raiseError: true;
  readonly awaitHandlers: true;
  readonly handleChatModelStart: (
    llm: object | undefined,
    messageBatches: readonly (readonly ModelBoundProviderMessage[])[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
  ) => void;
  readonly handleChainStart: (
    chain: object | undefined,
    inputs: unknown,
    runId: string,
    /** CallbackManager dispatches parentRunId here at runtime even though
     * BaseCallbackHandlerMethodsClass's published declaration labels this
     * position runType. Keep this signature aligned with manager dispatch. */
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
    extra?: Record<string, unknown>,
  ) => void;
  readonly handleLLMEnd: (output: unknown, runId: string) => void;
  readonly handleLLMError: (error: unknown, runId: string) => void;
  readonly handleChainEnd: (outputs: unknown, runId: string) => void;
  readonly handleChainError: (error: unknown, runId: string) => void;
}

export interface InitialModelBoundAdmission {
  readonly agentIds: readonly string[];
  readonly isActive: () => boolean;
  readonly onAllowed: () => void;
}

export interface ModelBoundContentInput {
  readonly filters?: FiltersConfig;
  readonly legacyPii?: MessageFilterPiiConfig;
  /** Fresh API input: every role is caller-submitted. */
  readonly submittedMessages?: readonly ModelBoundMessage[];
  /** Persisted chat history: user rows plus structured tool fragments are re-inspected. */
  readonly storedMessages?: readonly StoredModelBoundMessage[];
  readonly agents?: readonly (AgentContentInput | null | undefined)[];
  readonly assistants?: readonly (AssistantContentInput | null | undefined)[];
  readonly actions?: readonly (AssistantActionContentInput | null | undefined)[];
  readonly skills?: readonly (SkillContentInput | null | undefined)[];
  readonly memories?: readonly (MemoryContentInput | string | null | undefined)[];
  readonly files?: readonly (FileContentInput | string | null | undefined)[];
  /**
   * Owner-scoped canonical file rows that authorize durable file locators in
   * stored messages. The rows are inspected before their IDs are omitted from
   * the fail-close traversal copy.
   */
  readonly resolvedFiles?: readonly (ModelBoundCanonicalFile | null | undefined)[];
}

/**
 * Whether a policy can inspect content at a model/provider boundary.
 * Management-only sources and attribution behavior do not activate this gate.
 */
export function hasModelBoundContentProtection(
  filters: FiltersConfig | null | undefined,
  legacyPii?: MessageFilterPiiConfig | null,
): boolean {
  return (
    hasActivePiiPatterns(legacyPii) ||
    hasActivePiiPatterns(filters?.messages?.pii) ||
    hasActivePiiPatterns(filters?.agentInstructions?.pii) ||
    hasActivePiiPatterns(filters?.conversationStarters?.pii) ||
    hasActivePiiPatterns(filters?.skills?.pii) ||
    hasActivePiiPatterns(filters?.memories?.pii) ||
    hasActiveFilePolicy(filters ?? undefined) ||
    hasActivePiiPatterns(filters?.toolArguments?.pii) ||
    hasActivePiiPatterns(filters?.modelParameters?.pii) ||
    hasActivePiiPatterns(filters?.actionMetadata?.pii)
  );
}

function normalizeRole(message: {
  readonly role?: string;
  readonly _getType?: () => string;
}): string | undefined {
  const rawRole = message.role ?? message._getType?.();
  switch (rawRole) {
    case 'human':
      return 'user';
    case 'ai':
      return 'assistant';
    default:
      return rawRole;
  }
}

function assertInspectableFileInput(filters: FiltersConfig | undefined, input: unknown): void {
  const field = getBlockedOpaqueFileField(filters, input);
  if (field != null) {
    throw new UninspectableFileError(field);
  }
}

type RuntimeAgentFileContainer = AgentContentInput & {
  readonly attachments?: readonly (FileContentInput | null | undefined)[];
  readonly requestAttachments?: readonly (FileContentInput | null | undefined)[];
  readonly agentContextAttachments?: readonly (FileContentInput | null | undefined)[];
  readonly tool_resources?: Readonly<
    Record<
      string,
      | {
          readonly files?: readonly (FileContentInput | null | undefined)[];
        }
      | null
      | undefined
    >
  >;
};

function getHydratedAgentFiles(
  agent: AgentContentInput | null | undefined,
): ModelBoundCanonicalFile[] {
  if (agent == null) {
    return [];
  }
  const runtimeAgent = agent as RuntimeAgentFileContainer;
  const files: ModelBoundCanonicalFile[] = [];
  const append = (values: readonly (FileContentInput | null | undefined)[] | undefined) => {
    for (const file of values ?? []) {
      if (file != null) {
        files.push(file);
      }
    }
  };
  append(runtimeAgent.attachments);
  append(runtimeAgent.requestAttachments);
  append(runtimeAgent.agentContextAttachments);
  for (const resource of Object.values(runtimeAgent.tool_resources ?? {})) {
    append(resource?.files);
  }
  return files;
}

function isFragmentWithinPath(fragment: TextContentFragment, path: JsonPointer): boolean {
  return fragment.path === path || fragment.path.startsWith(`${path}/`);
}

function asUserSubmittedMessageFragment(
  fragment: Extract<TextContentFragment, { source: 'tool_argument' }>,
): Extract<TextContentFragment, { source: 'message' }> {
  return {
    ...fragment,
    id: `${fragment.id}.user-submitted-message`,
    source: 'message',
    field: 'content_part',
    treatment: 'inspect_only',
  };
}

function getExactUserSubmittedMessageFragments(
  fragments: readonly TextContentFragment[],
  entries: readonly UserSubmittedMessageFieldPath[],
): Array<Extract<TextContentFragment, { source: 'message' }>> {
  const exact: Array<Extract<TextContentFragment, { source: 'message' }>> = [];
  const seen = new Set<string>();
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];
    const path = entry.path as JsonPointer;
    for (const fragment of fragments) {
      if (
        (fragment.source !== 'message' && fragment.source !== 'tool_argument') ||
        !isFragmentWithinPath(fragment, path)
      ) {
        continue;
      }
      const key = `${entry.field}:${fragment.path}:${fragment.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      exact.push({
        ...fragment,
        id: `${fragment.id}.user-submitted-${entry.field}.${entryIndex}`,
        source: 'message',
        field: entry.field,
        treatment: 'inspect_only',
        provenance: 'user',
      });
    }
  }
  return exact;
}

/**
 * Rebuilds the model-equivalent aggregate from user-authored leaves only.
 * The stored adapter's aggregate spans the whole message, so using it for a
 * mixed assistant row would either include model prose or miss leaf-level
 * provenance marks rooted below `/content`.
 */
function getUserSubmittedAssembledContext(
  fragments: readonly TextContentFragment[],
): Extract<TextContentFragment, { source: 'assembled_context' }> | undefined {
  const text: string[] = [];
  for (const fragment of fragments) {
    if (
      fragment.source === 'message' &&
      (fragment.field === 'text' || fragment.field === 'content_part')
    ) {
      text.push(fragment.text);
      continue;
    }
    if (fragment.source === 'tool_argument' && fragment.field === 'output') {
      text.push(fragment.text);
    }
  }
  if (text.length === 0) {
    return undefined;
  }
  return {
    id: 'stored-message.user-submitted-assembled',
    path: '/$assembled/user-submitted',
    text: text.join(''),
    source: 'assembled_context',
    field: 'assembled_context',
    format: 'plain',
    treatment: 'inspect_only',
    provenance: 'user',
  };
}

/**
 * Builds a sparse object containing only marked fields while retaining their
 * original keys and ancestry. File fail-close checks need that shape to
 * distinguish, for example, a submitted `file_id` from unrelated model data.
 */
function projectUserSubmittedPaths(
  message: StoredModelBoundMessage,
  paths: readonly JsonPointer[],
): Record<string, unknown> | undefined {
  const projection: Record<string, unknown> = {};
  let projected = false;

  for (const path of paths) {
    const segments = getSafeUserSubmittedPathSegments(path);
    if (segments == null) {
      continue;
    }

    let source: unknown = message;
    for (const segment of segments) {
      if (
        source == null ||
        typeof source !== 'object' ||
        !Object.prototype.hasOwnProperty.call(source, segment)
      ) {
        source = undefined;
        break;
      }
      source = (source as Record<string, unknown>)[segment];
    }
    if (source === undefined) {
      continue;
    }

    let target: Record<string, unknown> | unknown[] = projection;
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (index === segments.length - 1) {
        (target as Record<string, unknown>)[segment] = source;
        projected = true;
        break;
      }
      const nextSegment = segments[index + 1];
      const existing = (target as Record<string, unknown>)[segment];
      if (existing == null || typeof existing !== 'object') {
        (target as Record<string, unknown>)[segment] = /^\d+$/.test(nextSegment) ? [] : {};
      }
      target = (target as Record<string, unknown>)[segment] as Record<string, unknown> | unknown[];
    }
  }

  return projected ? projection : undefined;
}

function extractExactUserSubmittedMessageFragments(
  message: StoredModelBoundMessage,
  entries: readonly UserSubmittedMessageFieldPath[],
): {
  fragments: Array<Extract<TextContentFragment, { source: 'message' }>>;
  traversalError: ContentTraversalLimitError | null;
} {
  const projectedMessage = projectUserSubmittedPaths(
    message,
    entries.map((entry) => entry.path as JsonPointer),
  );
  if (projectedMessage == null) {
    return { fragments: [], traversalError: null };
  }
  let projectedFragments: readonly TextContentFragment[];
  let traversalError: ContentTraversalLimitError | null = null;
  try {
    projectedFragments = extractStoredMessageContent(projectedMessage);
  } catch (error) {
    if (!isContentTraversalLimitError(error)) {
      throw error;
    }
    traversalError = error;
    projectedFragments = getContentTraversalFragments(error);
  }
  return {
    fragments: getExactUserSubmittedMessageFragments(projectedFragments, entries),
    traversalError,
  };
}

function appendSourceMessageId(sourceIds: Set<string>, candidate: string | undefined): void {
  if (typeof candidate !== 'string') {
    return;
  }
  const normalized = candidate.trim();
  if (normalized.length > 0) {
    sourceIds.add(normalized);
  }
}

function getProviderSourceMessageIds(message: ModelBoundProviderMessage): Set<string> {
  const sourceIds = new Set<string>();
  for (const sourceId of message.additional_kwargs?.sourceMessageIds ?? []) {
    appendSourceMessageId(sourceIds, sourceId);
  }
  appendSourceMessageId(sourceIds, message.additional_kwargs?.sourceMessageId);
  appendSourceMessageId(sourceIds, message.messageId);
  appendSourceMessageId(sourceIds, message.id);
  return sourceIds;
}

function getStoredMessageIds(message: StoredModelBoundMessage): Set<string> {
  const messageIds = new Set<string>();
  appendSourceMessageId(messageIds, message.messageId);
  appendSourceMessageId(messageIds, message.id);
  return messageIds;
}

function isSteerSubmittedPath(message: StoredModelBoundMessage, path: JsonPointer): boolean {
  const segments = getSafeUserSubmittedPathSegments(path);
  if (segments == null || segments[0] !== 'content' || !/^\d+$/.test(segments[1] ?? '')) {
    return false;
  }
  const part = Array.isArray(message.content) ? message.content[Number(segments[1])] : undefined;
  return part != null && typeof part === 'object' && part.type === 'steer';
}

function appendReferencedFileIds(
  fileIds: Set<string>,
  references: readonly ({ readonly file_id?: string } | null | undefined)[] | null | undefined,
): void {
  for (const reference of references ?? []) {
    const fileId = reference?.file_id;
    if (typeof fileId === 'string' && fileId.length > 0) {
      fileIds.add(fileId);
    }
  }
}

function appendPartFileIds(
  fileIds: Set<string>,
  part: NonNullable<NonNullable<StoredMessageContentInput['content']>[number]>,
) {
  appendReferencedFileIds(fileIds, part.files);
  appendReferencedFileIds(fileIds, part.image_file == null ? undefined : [part.image_file]);
  appendReferencedFileIds(fileIds, part.file == null ? undefined : [part.file]);
  if (typeof part.file_id === 'string' && part.file_id.length > 0) {
    fileIds.add(part.file_id);
  }
}

function appendStoredMessageFileIds(
  fileIds: Set<string>,
  message: StoredModelBoundMessage,
  filters: FiltersConfig | undefined,
): void {
  const submittedPathState = getUserSubmittedPathState(message);
  const role = normalizeRole(message);
  const isEntireMessageUserSubmitted =
    message.isCreatedByUser === true ||
    message.isUserSubmitted === true ||
    role === 'user' ||
    role === 'tool' ||
    submittedPathState.overflowed ||
    (filters?.messages?.unattributedAssistantContent === 'inspect' &&
      typeof message.isUserSubmitted !== 'boolean' &&
      submittedPathState.paths.length === 0 &&
      (message.isCreatedByUser === false || role === 'assistant'));
  if (isEntireMessageUserSubmitted) {
    appendReferencedFileIds(fileIds, message.files);
  }
  const content = Array.isArray(message.content) ? message.content : [];
  for (let index = 0; index < content.length; index++) {
    const part = content[index];
    if (part == null) {
      continue;
    }
    const partPath = `/content/${index}`;
    const hasSubmittedFilePath = submittedPathState.paths.some(
      (path) =>
        path === partPath ||
        path.startsWith(`${partPath}/files`) ||
        path.startsWith(`${partPath}/file_id`) ||
        path.startsWith(`${partPath}/file`) ||
        path.startsWith(`${partPath}/image_file`),
    );
    if (isEntireMessageUserSubmitted || hasSubmittedFilePath) {
      appendPartFileIds(fileIds, part);
    }
  }
}

function projectProviderMessage(message: ModelBoundProviderMessage): StoredModelBoundMessage {
  const role = normalizeRole(message);
  const providerSource = message.additional_kwargs?.source;
  const isSyntheticContext =
    message.additional_kwargs?.isMeta === true ||
    (providerSource != null && providerSource !== 'steer') ||
    (message.additional_kwargs?.injected === true && providerSource !== 'steer');
  const isUser = role === 'user' && !isSyntheticContext;
  const { content, text: providerText, ...messageWithoutContent } = message;
  const providerContent = content ?? providerText;
  return {
    ...messageWithoutContent,
    role,
    isCreatedByUser: isUser,
    isUserSubmitted: isUser,
    ...(typeof providerContent === 'string'
      ? { text: providerContent }
      : { content: providerContent }),
  };
}

function projectStoredMessageForProvider(
  message: StoredModelBoundMessage,
): StoredModelBoundMessage {
  const {
    attachments: _attachments,
    feedback: _feedback,
    files: _files,
    name: _name,
    original: _original,
    sender: _sender,
    summary: _summary,
    text: storedText,
    updated: _updated,
    ...providerMessageWithoutText
  } = message;
  const providerMessage: StoredModelBoundMessage = {
    ...providerMessageWithoutText,
    ...(message.content == null && storedText != null ? { text: storedText } : {}),
  };
  if (!Array.isArray(message.content)) {
    return providerMessage;
  }
  return {
    ...providerMessage,
    content: message.content.map((part) => {
      if (part == null) {
        return part;
      }
      const {
        file: _partFile,
        files: _partFiles,
        image_file: _imageFile,
        file_id: _fileId,
        ...providerPart
      } = part;
      return providerPart;
    }),
  };
}

interface ModelBoundProviderContentIndex {
  readonly storedMessagesById: ReadonlyMap<string, StoredModelBoundMessage>;
  readonly resolvedFilesById: ReadonlyMap<string, ModelBoundCanonicalFile>;
}

function createModelBoundProviderContentIndex(
  input: Pick<ModelBoundProviderContentInput, 'storedMessages' | 'resolvedFiles'>,
): ModelBoundProviderContentIndex {
  const storedMessagesById = new Map<string, StoredModelBoundMessage>();
  for (const message of input.storedMessages ?? []) {
    if (message == null) {
      continue;
    }
    for (const messageId of getStoredMessageIds(message)) {
      storedMessagesById.set(messageId, message);
    }
  }
  const resolvedFilesById = new Map<string, ModelBoundCanonicalFile>();
  for (const file of input.resolvedFiles ?? []) {
    if (typeof file?.file_id === 'string' && file.file_id.length > 0) {
      resolvedFilesById.set(file.file_id, file);
    }
  }
  return { storedMessagesById, resolvedFilesById };
}

function projectModelBoundProviderContent(
  input: ModelBoundProviderContentInput,
  index: ModelBoundProviderContentIndex,
): {
  storedMessages: StoredModelBoundMessage[];
  resolvedFiles: ModelBoundCanonicalFile[];
} {
  const selectedMessages: StoredModelBoundMessage[] = [];
  const selectedStoredMessages = new Set<StoredModelBoundMessage>();
  const selectedFileIds = new Set<string>();
  const selectStoredMessage = (message: StoredModelBoundMessage): void => {
    if (selectedStoredMessages.has(message)) {
      return;
    }
    selectedStoredMessages.add(message);
    selectedMessages.push(projectStoredMessageForProvider(message));
  };
  for (const providerMessage of input.providerMessages) {
    const sourceIds = getProviderSourceMessageIds(providerMessage);
    const providerRole = normalizeRole(providerMessage);
    let hasSubmittedCanonicalSource = false;
    for (const sourceId of sourceIds) {
      const storedMessage = index.storedMessagesById.get(sourceId);
      if (storedMessage == null) {
        continue;
      }
      const storedRole = normalizeRole(storedMessage);
      const isStoredUserSource =
        storedMessage.isCreatedByUser === true ||
        storedMessage.isUserSubmitted === true ||
        storedRole === 'user';
      const submittedPathState = getUserSubmittedPathState(storedMessage);
      const submittedMessageFieldState = getUserSubmittedMessageFieldPathState(storedMessage);
      const explicitSubmittedPaths = new Set(
        (storedMessage.userSubmittedPaths ?? []).filter(
          (path): path is string => typeof path === 'string',
        ),
      );
      const hasStoredSubmittedProvenance =
        submittedPathState.overflowed ||
        submittedMessageFieldState.overflowed ||
        submittedPathState.paths.some(
          (path) => explicitSubmittedPaths.has(path) && !isSteerSubmittedPath(storedMessage, path),
        ) ||
        submittedMessageFieldState.entries.length > 0;
      hasSubmittedCanonicalSource ||= hasStoredSubmittedProvenance;
      const needsCanonicalProvenance =
        isStoredUserSource ||
        hasStoredSubmittedProvenance ||
        providerRole === 'user' ||
        (input.filters?.messages?.unattributedAssistantContent === 'inspect' &&
          providerRole === 'assistant');
      if (needsCanonicalProvenance) {
        selectStoredMessage(storedMessage);
      }
      if (isStoredUserSource || hasStoredSubmittedProvenance || providerRole === 'user') {
        for (const fileId of input.fileIdsBySourceMessageId?.get(sourceId) ?? []) {
          if (typeof fileId === 'string' && fileId.length > 0) {
            selectedFileIds.add(fileId);
          }
        }
      }
    }

    /** Always inspect the exact final wire payload as well as canonical rows.
     * This covers provider transformations and source-backed content merged
     * with synthetic HumanMessages while canonical rows retain durable HITL
     * and file provenance. Assistant/model prose remains model-attributed. */
    let projectedMessage = projectProviderMessage(providerMessage);
    if (providerRole === 'assistant' && hasSubmittedCanonicalSource) {
      /** A mixed assistant row can collapse a user-edited/HITL fragment and
       * adjacent model text into one provider AI payload. Until the SDK emits
       * per-derived-part lineage, inspect that exact payload fail-closed so a
       * blocked value cannot be assembled across the attribution boundary.
       * Steer-only provenance is excluded above because steers are emitted as
       * their own HumanMessages and may be pruned independently. */
      projectedMessage = {
        ...projectedMessage,
        isCreatedByUser: true,
        isUserSubmitted: true,
      };
    }
    selectedMessages.push(projectedMessage);
    appendStoredMessageFileIds(selectedFileIds, projectedMessage, input.filters);
  }

  const resolvedFiles: ModelBoundCanonicalFile[] = [];
  for (const fileId of selectedFileIds) {
    const file = index.resolvedFilesById.get(fileId);
    if (file != null) {
      resolvedFiles.push(file);
    }
  }
  if (selectedFileIds.size > 0) {
    selectedMessages.push({
      role: 'user',
      isCreatedByUser: true,
      isUserSubmitted: true,
      files: [...selectedFileIds].map((file_id) => ({ file_id })),
    });
  }
  return { storedMessages: selectedMessages, resolvedFiles };
}

function assertIndexedModelBoundProviderContent(
  input: ModelBoundProviderContentInput,
  index: ModelBoundProviderContentIndex,
): void {
  if (!hasModelBoundContentProtection(input.filters, input.legacyPii)) {
    return;
  }
  const projection = projectModelBoundProviderContent(input, index);
  assertModelBoundContent({
    filters: input.filters,
    legacyPii: input.legacyPii,
    storedMessages: projection.storedMessages,
    resolvedFiles: projection.resolvedFiles,
  });
}

/** Inspects the exact provider selection while retaining persisted provenance. */
export function assertModelBoundProviderContent(input: ModelBoundProviderContentInput): void {
  assertIndexedModelBoundProviderContent(input, createModelBoundProviderContentIndex(input));
}

/** Creates a run-stable callback shared by root, summary, and subagent model clients. */
export function createModelBoundChatModelCallback(
  input: Omit<ModelBoundProviderContentInput, 'providerMessages'>,
  options: { readonly onContentRejected?: (error: unknown) => void } = {},
): ModelBoundChatModelCallback {
  const storedMessages = [...(input.storedMessages ?? [])];
  const resolvedFiles = [...(input.resolvedFiles ?? [])];
  const fileIdsBySourceMessageId = new Map(
    [...(input.fileIdsBySourceMessageId ?? [])].map(([sourceMessageId, fileIds]) => [
      sourceMessageId,
      [...fileIds],
    ]),
  );
  const stableInput = {
    filters: input.filters,
    legacyPii: input.legacyPii,
    storedMessages,
    resolvedFiles,
    fileIdsBySourceMessageId,
  };
  const index = createModelBoundProviderContentIndex(stableInput);
  const callback: ModelBoundChatModelCallback = Object.freeze({
    name: 'librechat-model-bound-content-filter',
    raiseError: true,
    awaitHandlers: true,
    handleChatModelStart: (
      _llm: object | undefined,
      messageBatches: readonly (readonly ModelBoundProviderMessage[])[],
    ) => {
      for (const providerMessages of messageBatches) {
        try {
          assertIndexedModelBoundProviderContent(
            {
              ...stableInput,
              providerMessages,
            },
            index,
          );
        } catch (error) {
          if (!isContentFilterError(error) || error instanceof FatalModelBoundPolicyError) {
            throw error;
          }
          options.onContentRejected?.(error);
          throw new FatalModelBoundPolicyError(error);
        }
      }
    },
  });
  return callback;
}

/**
 * Holds a deferred parent write until every top-level starting agent clears
 * its first exact provider boundary and the corresponding model-node chain
 * completes. This callback belongs on the root RunnableConfig only: intrinsic
 * model callbacks intentionally propagate into subagents, whose reused agent
 * IDs must never satisfy a parent graph's admission barrier.
 */
export function createInitialModelBoundAdmissionCallback(
  admission: InitialModelBoundAdmission,
): InitialModelBoundAdmissionCallback {
  const pendingAgentIds = new Set(
    admission.agentIds
      .filter((agentId): agentId is string => typeof agentId === 'string')
      .map((agentId) => agentId.trim())
      .filter((agentId) => agentId.length > 0),
  );
  const chainParents = new Map<string, string>();
  const agentNodeRuns = new Map<string, string>();
  const modelRuns = new Map<string, string>();
  const successfulAgentNodeRuns = new Set<string>();
  let allowed = false;
  const isEligibleRootModel = (
    metadata: Record<string, unknown> | undefined,
  ): metadata is Record<string, unknown> & { agentId: string } => {
    if (metadata?.summarization === true || typeof metadata?.agentId !== 'string') {
      return false;
    }
    const agentId = metadata.agentId.trim();
    return pendingAgentIds.has(agentId) && metadata.langgraph_node === `agent=${agentId}`;
  };
  const findAgentNodeRun = (parentRunId: string, agentId: string): string | undefined => {
    const visited = new Set<string>();
    let currentRunId: string | undefined = parentRunId;
    while (currentRunId != null && !visited.has(currentRunId)) {
      visited.add(currentRunId);
      if (agentNodeRuns.get(currentRunId) === agentId) {
        return currentRunId;
      }
      currentRunId = chainParents.get(currentRunId);
    }
    return undefined;
  };
  const clearAgentNodeRun = (agentNodeRunId: string): void => {
    agentNodeRuns.delete(agentNodeRunId);
    successfulAgentNodeRuns.delete(agentNodeRunId);
    chainParents.delete(agentNodeRunId);
    for (const [modelRunId, nodeRunId] of modelRuns) {
      if (nodeRunId === agentNodeRunId) {
        modelRuns.delete(modelRunId);
      }
    }
  };

  return Object.freeze({
    name: 'librechat-initial-model-bound-admission',
    raiseError: true,
    awaitHandlers: true,
    handleChainStart: (_chain, _inputs, runId, parentRunId, _tags, metadata, _runType, runName) => {
      if (typeof parentRunId === 'string') {
        chainParents.set(runId, parentRunId);
      }
      const nodeName = metadata?.langgraph_node;
      if (typeof nodeName !== 'string' || !nodeName.startsWith('agent=') || runName !== nodeName) {
        return;
      }
      const agentId = nodeName.slice('agent='.length).trim();
      if (pendingAgentIds.has(agentId)) {
        agentNodeRuns.set(runId, agentId);
      }
    },
    handleChatModelStart: (
      _llm,
      _messageBatches,
      runId,
      parentRunId,
      _extraParams,
      _tags,
      metadata,
    ) => {
      if (allowed || !admission.isActive() || !isEligibleRootModel(metadata)) {
        return;
      }
      if (typeof runId !== 'string' || typeof parentRunId !== 'string') {
        return;
      }
      const agentNodeRunId = findAgentNodeRun(parentRunId, metadata.agentId.trim());
      if (agentNodeRunId != null) {
        modelRuns.set(runId, agentNodeRunId);
      }
    },
    handleLLMEnd: (_output, runId) => {
      const agentNodeRunId = modelRuns.get(runId);
      if (agentNodeRunId == null) {
        return;
      }
      modelRuns.delete(runId);
      successfulAgentNodeRuns.add(agentNodeRunId);
    },
    handleLLMError: (_error, runId) => {
      modelRuns.delete(runId);
    },
    handleChainEnd: (outputs, runId) => {
      chainParents.delete(runId);
      const agentId = agentNodeRuns.get(runId);
      const modelNodeOutput =
        outputs != null && typeof outputs === 'object'
          ? (outputs as { messages?: unknown; summarizationRequest?: unknown })
          : undefined;
      const hasCompletedModelResult =
        Array.isArray(modelNodeOutput?.messages) &&
        modelNodeOutput.messages.length > 0 &&
        modelNodeOutput.summarizationRequest == null;
      const hasSuccessfulAttempt = successfulAgentNodeRuns.has(runId);
      if (agentId != null) {
        clearAgentNodeRun(runId);
      }
      if (
        agentId == null ||
        !hasSuccessfulAttempt ||
        !hasCompletedModelResult ||
        allowed ||
        !admission.isActive() ||
        !pendingAgentIds.delete(agentId)
      ) {
        return;
      }
      if (pendingAgentIds.size === 0) {
        allowed = true;
        admission.onAllowed();
      }
    },
    handleChainError: (_error, runId) => {
      chainParents.delete(runId);
      if (agentNodeRuns.has(runId)) {
        clearAgentNodeRun(runId);
      }
    },
  });
}

/**
 * Re-inspects the final model-bound representation. This makes a newly
 * enabled or tightened policy apply to persisted messages and reusable
 * agent/skill/memory/file context, not only to the request that created it.
 */
export function assertModelBoundContent(input: ModelBoundContentInput): void {
  const inspector = createConfiguredContentInspector({
    filters: input.filters,
    legacyPii: input.legacyPii,
  });
  const hasFileFailClose =
    getBlockedUninspectableFileField(input.filters, ['content', 'extracted_text', 'transcript']) !=
    null;
  if (inspector == null && !hasFileFailClose) {
    return;
  }
  const fragments: TextContentFragment[] = [];
  const traversalErrors: ContentTraversalLimitError[] = [];
  const appendExtractedContent = (extract: () => readonly TextContentFragment[]) => {
    try {
      fragments.push(...extract());
    } catch (error) {
      if (!isContentTraversalLimitError(error)) {
        throw error;
      }
      fragments.push(...getContentTraversalFragments(error));
      if (
        isContentTraversalProtected({
          error,
          filters: input.filters,
          legacyPii: input.legacyPii,
        })
      ) {
        traversalErrors.push(error);
      }
    }
  };
  const resolvedFilesById = new Map<string, ModelBoundCanonicalFile>();
  const appendFile = (
    file: FileContentInput | string | null | undefined,
  ): ModelBoundCanonicalFile | undefined => {
    if (file == null) {
      return undefined;
    }
    const isHydratedCanonicalFile =
      typeof file === 'object' &&
      typeof (file as { file_id?: unknown }).file_id === 'string' &&
      (file as { file_id: string }).file_id.length > 0;
    if (isHydratedCanonicalFile) {
      assertHydratedFileInspectable(input.filters, file);
      assertInspectableFileInput(allowHydratedFileReferences(input.filters), file);
    } else {
      assertInspectableFileInput(input.filters, file);
    }
    fragments.push(
      ...extractFileContent(typeof file === 'string' ? { content: file, text: file } : file),
    );
    return isHydratedCanonicalFile ? (file as ModelBoundCanonicalFile) : undefined;
  };
  for (const file of input.resolvedFiles ?? []) {
    const resolvedFile = appendFile(file);
    if (resolvedFile?.file_id != null) {
      resolvedFilesById.set(resolvedFile.file_id, resolvedFile);
    }
  }
  if (input.submittedMessages != null) {
    assertInspectableFileInput(input.filters, input.submittedMessages);
    try {
      for (const fragment of extractMessageContent(
        input.submittedMessages.map((message) => ({
          ...message,
          role: normalizeRole(message),
          content: message.content,
        })),
      )) {
        fragments.push(fragment);
      }
    } catch (error) {
      if (!isContentTraversalLimitError(error)) {
        throw error;
      }
      if (
        isNestedMessageTraversalProtected({
          filters: input.filters,
          legacyPii: input.legacyPii,
          roles: input.submittedMessages.map(normalizeRole),
        })
      ) {
        traversalErrors.push(error);
      }
    }
  }
  const storedUserMessages: StoredModelBoundMessage[] = [];
  for (const message of input.storedMessages ?? []) {
    const submittedPathState = getUserSubmittedPathState(message);
    const submittedMessageFieldState = getUserSubmittedMessageFieldPathState(message);
    const semanticUserSubmittedPaths = submittedMessageFieldState.entries.map(
      (entry) => entry.path as JsonPointer,
    );
    const effectiveUserSubmittedPaths = [
      ...new Set([...submittedPathState.paths, ...semanticUserSubmittedPaths]),
    ];
    const isUnattributedAssistant =
      input.filters?.messages?.unattributedAssistantContent === 'inspect' &&
      typeof message.isUserSubmitted !== 'boolean' &&
      effectiveUserSubmittedPaths.length === 0 &&
      (message.isCreatedByUser === false || normalizeRole(message) === 'assistant');
    const isEntireMessageUserSubmitted =
      message?.isCreatedByUser === true ||
      message?.isUserSubmitted === true ||
      submittedPathState.overflowed ||
      isUnattributedAssistant;
    let messageFragments: readonly TextContentFragment[];
    let traversalError: ContentTraversalLimitError | null = null;
    try {
      messageFragments = extractStoredMessageContent(message);
    } catch (error) {
      if (!isContentTraversalLimitError(error)) {
        throw error;
      }
      traversalError = error;
      messageFragments = getContentTraversalFragments(error);
    }
    const exactMessageInspection = extractExactUserSubmittedMessageFragments(
      message,
      submittedMessageFieldState.entries,
    );
    const exactMessageFragments = exactMessageInspection.fragments;
    const exactMessageFields = [
      ...new Set(submittedMessageFieldState.entries.map((entry) => entry.field)),
    ];
    if (
      exactMessageInspection.traversalError != null &&
      (hasActivePiiPatterns(input.legacyPii) ||
        hasActivePiiFields(input.filters?.messages?.pii, exactMessageFields))
    ) {
      traversalErrors.push(
        new ContentTraversalLimitError([], [{ source: 'message', fields: exactMessageFields }]),
      );
    }
    if (
      submittedMessageFieldState.overflowed &&
      (hasActivePiiPatterns(input.legacyPii) ||
        hasActivePiiFields(input.filters?.messages?.pii, HITL_MESSAGE_FILTER_FIELDS))
    ) {
      traversalErrors.push(
        new ContentTraversalLimitError(
          [],
          [{ source: 'message', fields: [...HITL_MESSAGE_FILTER_FIELDS] }],
        ),
      );
    }
    if (!isEntireMessageUserSubmitted) {
      const userSubmittedPaths = submittedPathState.paths;
      const projectedMessage = projectUserSubmittedPaths(message, effectiveUserSubmittedPaths);
      if (projectedMessage != null) {
        assertInspectableFileInput(
          input.filters,
          omitResolvedCanonicalFileLocators(projectedMessage, resolvedFilesById),
        );
      }
      /** Legacy unmarked assistant rows are treated as model-generated by
       *  default. Strict attribution can inspect an otherwise unattributed
       *  assistant row as submitted content. Structured tool calls/results
       *  remain externally sourced model-bound content. Explicit paths and
       *  semantic steer parts identify user-authored fragments in mixed rows. */
      const submittedFragments = messageFragments.filter((fragment) =>
        userSubmittedPaths.some((path) => isFragmentWithinPath(fragment, path)),
      );
      const userSubmittedAssembledContext = getUserSubmittedAssembledContext(submittedFragments);
      fragments.push(
        ...messageFragments.filter((fragment) => fragment.source === 'tool_argument'),
        ...submittedFragments.filter((fragment) => fragment.source !== 'tool_argument'),
        ...submittedFragments
          .filter(
            (fragment): fragment is Extract<TextContentFragment, { source: 'tool_argument' }> =>
              fragment.source === 'tool_argument' && fragment.field === 'output',
          )
          .map(asUserSubmittedMessageFragment),
        ...exactMessageFragments,
      );
      if (userSubmittedAssembledContext != null) {
        fragments.push(userSubmittedAssembledContext);
      }
      if (traversalError != null) {
        let traversalFilters = input.filters;
        if (userSubmittedPaths.length === 0 && traversalFilters != null) {
          traversalFilters = { ...traversalFilters, messages: undefined };
        }
        if (
          isContentTraversalProtected({
            error: traversalError,
            filters: traversalFilters,
            legacyPii: userSubmittedPaths.length > 0 ? input.legacyPii : undefined,
            roles: userSubmittedPaths.length > 0 ? ['user'] : [message.role],
          })
        ) {
          traversalErrors.push(traversalError);
        }
      }
      continue;
    }
    storedUserMessages.push(message);
    fragments.push(...messageFragments, ...exactMessageFragments);
    if (
      traversalError != null &&
      isContentTraversalProtected({
        error: traversalError,
        filters: input.filters,
        legacyPii: input.legacyPii,
        roles: [message.role ?? 'user'],
      })
    ) {
      traversalErrors.push(traversalError);
    }
  }
  assertInspectableFileInput(
    input.filters,
    omitResolvedCanonicalFileLocators(storedUserMessages, resolvedFilesById),
  );
  for (const agent of input.agents ?? []) {
    const agentFilesById = new Map<string, ModelBoundCanonicalFile>();
    for (const file of getHydratedAgentFiles(agent)) {
      const resolvedFile = appendFile(file);
      if (resolvedFile?.file_id != null) {
        agentFilesById.set(resolvedFile.file_id, resolvedFile);
      }
    }
    assertInspectableFileInput(
      input.filters,
      omitResolvedCanonicalFileLocators(agent, agentFilesById),
    );
    appendExtractedContent(() => extractAgentContent(agent));
  }
  for (const assistant of input.assistants ?? []) {
    assertInspectableFileInput(input.filters, assistant);
    appendExtractedContent(() => extractAssistantContent(assistant));
  }
  for (const action of input.actions ?? []) {
    appendExtractedContent(() => extractAssistantActionContent(action));
  }
  for (const skill of input.skills ?? []) {
    appendExtractedContent(() => extractSkillContent(skill));
  }
  for (const memory of input.memories ?? []) {
    fragments.push(
      ...extractMemoryContent(typeof memory === 'string' ? { value: memory } : memory),
    );
  }
  for (const file of input.files ?? []) {
    appendFile(file);
  }

  const finding = inspector?.inspect(fragments) ?? null;
  if (finding != null) {
    throw new ContentFilterError(finding);
  }
  if (traversalErrors.length > 0) {
    throw traversalErrors[0];
  }
}
