import { StreamLimitExceededError } from '@librechat/agents';
import {
  FILE_FILTER_FIELDS,
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
import type { ContentTraversalScope } from '../protection/adapters/nested';
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

export type ModelBoundProviderAttribution = 'user' | 'model' | 'tool' | 'synthetic';

export interface ModelBoundProviderProvenancePart {
  readonly attribution: ModelBoundProviderAttribution;
  readonly sourceMessageId?: string;
  readonly sourceContentPartIndices?: readonly number[];
}

export interface ModelBoundProviderProvenance {
  readonly version: 1;
  readonly parts: readonly ModelBoundProviderProvenancePart[];
}

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
      readonly provenance?: ModelBoundProviderProvenance;
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

const LEGACY_ARTIFACT_PROJECTION_MARKER =
  'Tool response is included in the next message as a Human message';
const PROVIDER_PROVENANCE_ATTRIBUTIONS = new Set<ModelBoundProviderAttribution>([
  'user',
  'model',
  'tool',
  'synthetic',
]);
const LEGACY_SYNTHETIC_PROVIDER_SOURCES = new Set(['handoff', 'hook', 'skill', 'system']);
const MAX_PROVIDER_PROVENANCE_PARTS = 256;
const MAX_PROVIDER_SOURCE_PART_INDICES = 256;
const MAX_PROVIDER_PROVENANCE_INDEX_REFS = 4_096;
const MAX_PROVIDER_SOURCE_MESSAGE_IDS = 256;
const MAX_PROVIDER_SOURCE_MESSAGE_ID_LENGTH = 512;
const MAX_PROVIDER_SOURCE_CONTENT_PART_INDEX = 4_095;

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
  /** Internal fail-closed provenance errors evaluated after files and findings. */
  readonly deferredTraversalErrors?: readonly ContentTraversalLimitError[];
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

function isFragmentWithinSubmittedPaths(
  fragment: TextContentFragment,
  submittedPaths: ReadonlySet<string>,
): boolean {
  let candidate = fragment.path as string;
  while (candidate.length > 0) {
    if (submittedPaths.has(candidate)) {
      return true;
    }
    const separator = candidate.lastIndexOf('/');
    if (separator <= 0) {
      return false;
    }
    candidate = candidate.slice(0, separator);
  }
  return false;
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
function createUserSubmittedAssembledContext(
  text: readonly string[],
): Extract<TextContentFragment, { source: 'assembled_context' }> | undefined {
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

interface ModelBoundProviderProvenanceState {
  readonly value?: ModelBoundProviderProvenance;
  readonly invalid: boolean;
}

interface LegacyProviderLineage {
  readonly sourceIds: ReadonlySet<string>;
  readonly hasPluralLineage: boolean;
  readonly invalid: boolean;
}

interface ProviderSourceContribution {
  readonly attribution: ModelBoundProviderAttribution;
  readonly sourceMessageId: string;
  readonly selectedContentPartIndices?: ReadonlySet<number>;
}

interface OrderedProviderSourceContributions {
  readonly contributions: readonly ProviderSourceContribution[];
  readonly hasUserAttribution: boolean;
  readonly hasToolAttribution: boolean;
}

function normalizeProviderSourceMessageId(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string') {
    return undefined;
  }
  const sourceMessageId = candidate.trim();
  if (
    sourceMessageId.length === 0 ||
    sourceMessageId.length > MAX_PROVIDER_SOURCE_MESSAGE_ID_LENGTH
  ) {
    return undefined;
  }
  return sourceMessageId;
}

function getProviderMessageProvenanceState(
  message: ModelBoundProviderMessage,
): ModelBoundProviderProvenanceState {
  const candidate: unknown = message.additional_kwargs?.provenance;
  if (candidate == null) {
    return { invalid: false };
  }
  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { invalid: true };
  }
  const value = candidate as { readonly version?: unknown; readonly parts?: unknown };
  const version = value.version;
  const candidateParts = value.parts;
  if (version !== 1 || !Array.isArray(candidateParts)) {
    return { invalid: true };
  }
  const candidatePartCount = candidateParts.length;
  if (candidatePartCount === 0 || candidatePartCount > MAX_PROVIDER_PROVENANCE_PARTS) {
    return { invalid: true };
  }

  const parts: ModelBoundProviderProvenancePart[] = [];
  let totalIndexRefs = 0;
  for (let partIndex = 0; partIndex < candidatePartCount; partIndex++) {
    const candidatePart = candidateParts[partIndex];
    if (
      candidatePart == null ||
      typeof candidatePart !== 'object' ||
      Array.isArray(candidatePart)
    ) {
      return { invalid: true };
    }
    const part = candidatePart as {
      readonly attribution?: unknown;
      readonly sourceMessageId?: unknown;
      readonly sourceContentPartIndices?: unknown;
    };
    const attribution = part.attribution;
    const candidateSourceMessageId = part.sourceMessageId;
    const candidateSourceContentPartIndices = part.sourceContentPartIndices;
    if (
      typeof attribution !== 'string' ||
      !PROVIDER_PROVENANCE_ATTRIBUTIONS.has(attribution as ModelBoundProviderAttribution)
    ) {
      return { invalid: true };
    }
    let sourceMessageId: string | undefined;
    if (candidateSourceMessageId !== undefined) {
      sourceMessageId = normalizeProviderSourceMessageId(candidateSourceMessageId);
      if (sourceMessageId == null) {
        return { invalid: true };
      }
    }
    let sourceContentPartIndices: number[] | undefined;
    if (candidateSourceContentPartIndices !== undefined) {
      if (!Array.isArray(candidateSourceContentPartIndices)) {
        return { invalid: true };
      }
      const candidateIndexCount = candidateSourceContentPartIndices.length;
      if (candidateIndexCount === 0 || candidateIndexCount > MAX_PROVIDER_SOURCE_PART_INDICES) {
        return { invalid: true };
      }
      totalIndexRefs += candidateIndexCount;
      if (totalIndexRefs > MAX_PROVIDER_PROVENANCE_INDEX_REFS) {
        return { invalid: true };
      }
      sourceContentPartIndices = [];
      const seenIndices = new Set<number>();
      for (let indexPosition = 0; indexPosition < candidateIndexCount; indexPosition++) {
        const index = candidateSourceContentPartIndices[indexPosition];
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index > MAX_PROVIDER_SOURCE_CONTENT_PART_INDEX
        ) {
          return { invalid: true };
        }
        if (!seenIndices.has(index)) {
          seenIndices.add(index);
          sourceContentPartIndices.push(index);
        }
      }
    }
    parts.push({
      attribution: attribution as ModelBoundProviderAttribution,
      ...(sourceMessageId != null && { sourceMessageId }),
      ...(sourceContentPartIndices != null && { sourceContentPartIndices }),
    });
  }
  return { value: { version: 1, parts }, invalid: false };
}

function getLegacyProviderLineage(message: ModelBoundProviderMessage): LegacyProviderLineage {
  const sourceIds = new Set<string>();
  let invalid = false;
  let hasPluralLineage = false;
  const pluralCandidate: unknown = message.additional_kwargs?.sourceMessageIds;
  if (pluralCandidate != null) {
    if (!Array.isArray(pluralCandidate)) {
      invalid = true;
    } else {
      const sourceMessageIdCount = pluralCandidate.length;
      if (sourceMessageIdCount > MAX_PROVIDER_SOURCE_MESSAGE_IDS) {
        invalid = true;
      } else {
        hasPluralLineage = sourceMessageIdCount > 0;
        for (let index = 0; index < sourceMessageIdCount; index++) {
          const candidate = pluralCandidate[index];
          const sourceMessageId = normalizeProviderSourceMessageId(candidate);
          if (sourceMessageId == null) {
            invalid = true;
            continue;
          }
          sourceIds.add(sourceMessageId);
        }
      }
    }
  }
  for (const candidate of [
    message.additional_kwargs?.sourceMessageId,
    message.messageId,
    message.id,
  ]) {
    if (candidate == null) {
      continue;
    }
    const sourceMessageId = normalizeProviderSourceMessageId(candidate);
    if (sourceMessageId == null) {
      invalid = true;
      continue;
    }
    sourceIds.add(sourceMessageId);
  }
  return { sourceIds, hasPluralLineage, invalid };
}

/** Coalesces only adjacent repeats. Non-contiguous contributions retain their
 * exact envelope order because canonical fragments can be adjacency-sensitive. */
function getOrderedProviderSourceContributions(
  provenance: ModelBoundProviderProvenance,
): OrderedProviderSourceContributions {
  const contributions: Array<{
    attribution: ModelBoundProviderAttribution;
    sourceMessageId: string;
    selectedContentPartIndices?: Set<number>;
  }> = [];
  let hasUserAttribution = false;
  let hasToolAttribution = false;
  for (const part of provenance.parts) {
    hasUserAttribution ||= part.attribution === 'user';
    hasToolAttribution ||= part.attribution === 'tool';
    if (part.sourceMessageId == null) {
      continue;
    }
    const existing = contributions[contributions.length - 1];
    if (
      existing == null ||
      existing.attribution !== part.attribution ||
      existing.sourceMessageId !== part.sourceMessageId
    ) {
      contributions.push({
        attribution: part.attribution,
        sourceMessageId: part.sourceMessageId,
        ...(part.sourceContentPartIndices != null && {
          selectedContentPartIndices: new Set(part.sourceContentPartIndices),
        }),
      });
      continue;
    }
    if (existing.selectedContentPartIndices == null) {
      continue;
    }
    if (part.sourceContentPartIndices == null) {
      delete existing.selectedContentPartIndices;
      continue;
    }
    for (const index of part.sourceContentPartIndices) {
      existing.selectedContentPartIndices.add(index);
    }
  }
  return { contributions, hasUserAttribution, hasToolAttribution };
}

function isLegacyArtifactProjectionMarker(content: unknown): boolean {
  if (content === LEGACY_ARTIFACT_PROJECTION_MARKER) {
    return true;
  }
  if (!Array.isArray(content) || content.length !== 1) {
    return false;
  }
  const part = content[0];
  if (part == null || typeof part !== 'object') {
    return false;
  }
  const value = part as { readonly text?: unknown; readonly content?: unknown };
  return (
    value.text === LEGACY_ARTIFACT_PROJECTION_MARKER ||
    value.content === LEGACY_ARTIFACT_PROJECTION_MARKER
  );
}

/** @librechat/agents 3.6.9 projects artifact-bearing ToolMessages into an
 * untyped terminal HumanMessage. Recognize only that generated adjacency and
 * exact marker; ordinary untyped HumanMessages must retain user attribution. */
function isLegacyArtifactProjectionHuman(
  messages: readonly ModelBoundProviderMessage[],
  index: number,
  provenanceState: ModelBoundProviderProvenanceState,
  legacyLineage: LegacyProviderLineage,
): boolean {
  const message = messages[index];
  if (
    message == null ||
    index !== messages.length - 1 ||
    provenanceState.value != null ||
    provenanceState.invalid ||
    normalizeRole(message) !== 'user' ||
    legacyLineage.invalid ||
    message.additional_kwargs?.sourceMessageId != null ||
    message.additional_kwargs?.sourceMessageIds != null ||
    message.messageId != null
  ) {
    return false;
  }
  const metadata = message.additional_kwargs;
  if (metadata?.isMeta === true || metadata?.injected === true || metadata?.source != null) {
    return false;
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
    const previous = messages[previousIndex];
    if (normalizeRole(previous) !== 'tool') {
      break;
    }
    if (isLegacyArtifactProjectionMarker(previous.content ?? previous.text)) {
      return true;
    }
  }
  return false;
}

function getLegacyCoalescedCanonicalScopes(
  filters: FiltersConfig | undefined,
): ContentTraversalScope[] {
  const scopes: ContentTraversalScope[] = [];
  const messagePii = filters?.messages?.pii;
  const selectedHitlFields = HITL_MESSAGE_FILTER_FIELDS.filter(
    (field) => messagePii?.fields == null || messagePii.fields.includes(field),
  );
  if (selectedHitlFields.length > 0 && hasActivePiiFields(messagePii, selectedHitlFields)) {
    scopes.push({
      source: 'message',
      fields: selectedHitlFields,
    });
  }

  const filePii = filters?.files?.pii;
  const selectedFileFields = FILE_FILTER_FIELDS.filter(
    (field) => filePii?.fields == null || filePii.fields.includes(field),
  );
  if (
    selectedFileFields.length > 0 &&
    (hasActivePiiFields(filePii, selectedFileFields) ||
      getBlockedUninspectableFileField(filters, selectedFileFields) != null)
  ) {
    scopes.push({ source: 'file', fields: selectedFileFields });
  }
  return scopes;
}

function getLegacyCoalescedLineageError(
  input: ModelBoundProviderContentInput,
  providerMessage: ModelBoundProviderMessage,
  matchedStoredMessages: ReadonlySet<StoredModelBoundMessage>,
  provenanceState: ModelBoundProviderProvenanceState,
  legacyLineage: LegacyProviderLineage,
): ContentTraversalLimitError | null {
  if (provenanceState.value != null) {
    return null;
  }
  const hasInvalidLineage = provenanceState.invalid || legacyLineage.invalid;
  const hasAmbiguousLegacyCoalescing =
    normalizeRole(providerMessage) === 'user' &&
    !legacyLineage.hasPluralLineage &&
    matchedStoredMessages.size >= 2;
  if (!hasInvalidLineage && !hasAmbiguousLegacyCoalescing) {
    return null;
  }
  const scopes = getLegacyCoalescedCanonicalScopes(input.filters);
  if (scopes.length > 0) {
    return new ContentTraversalLimitError([], scopes);
  }
  return null;
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
    if (typeof fileId === 'string' && fileId.trim().length > 0) {
      fileIds.add(fileId.trim());
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
  if (typeof part.file_id === 'string' && part.file_id.trim().length > 0) {
    fileIds.add(part.file_id.trim());
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
    (role === 'user' && message.isCreatedByUser !== false && message.isUserSubmitted !== false) ||
    role === 'tool' ||
    submittedPathState.overflowed ||
    (filters?.messages?.unattributedAssistantContent === 'inspect' &&
      typeof message.isUserSubmitted !== 'boolean' &&
      submittedPathState.paths.length === 0 &&
      (message.isCreatedByUser === false || role === 'assistant'));
  if (isEntireMessageUserSubmitted) {
    appendReferencedFileIds(fileIds, message.files);
  }
  const submittedFilePartIndices = new Set<number>();
  for (const path of submittedPathState.paths) {
    const segments = getSafeUserSubmittedPathSegments(path);
    if (
      segments?.[0] !== 'content' ||
      !/^\d+$/.test(segments[1] ?? '') ||
      (segments.length > 2 && !['file', 'file_id', 'files', 'image_file'].includes(segments[2]))
    ) {
      continue;
    }
    submittedFilePartIndices.add(Number(segments[1]));
  }
  const content = Array.isArray(message.content) ? message.content : [];
  for (let index = 0; index < content.length; index++) {
    const part = content[index];
    if (part == null) {
      continue;
    }
    if (isEntireMessageUserSubmitted || submittedFilePartIndices.has(index)) {
      appendPartFileIds(fileIds, part);
    }
  }
}

type ProviderExactAttribution = 'user' | 'tool' | 'non_user';

function projectProviderMessage(
  message: ModelBoundProviderMessage,
  attribution?: ProviderExactAttribution,
): StoredModelBoundMessage {
  const role = attribution === 'tool' ? 'tool' : normalizeRole(message);
  const providerSource = message.additional_kwargs?.source;
  const isSyntheticContext =
    message.additional_kwargs?.isMeta === true ||
    (typeof providerSource === 'string' && LEGACY_SYNTHETIC_PROVIDER_SOURCES.has(providerSource)) ||
    (message.additional_kwargs?.injected === true && providerSource !== 'steer');
  const isUser =
    attribution === 'user' || (attribution == null && role === 'user' && !isSyntheticContext);
  const { content, text: providerText, ...messageWithoutContent } = message;
  const rawProviderContent = content ?? providerText;
  let providerContent = rawProviderContent;
  if (
    (attribution === 'non_user' || attribution === 'tool') &&
    Array.isArray(rawProviderContent) &&
    rawProviderContent.some(
      (part) => part != null && typeof part === 'object' && part.type === 'steer',
    )
  ) {
    providerContent = rawProviderContent.map((part) =>
      part != null && typeof part === 'object' && part.type === 'steer'
        ? { ...part, type: 'text' }
        : part,
    );
  }
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
  selectedContentPartIndices?: ReadonlySet<number>,
  attribution?: Extract<ProviderExactAttribution, 'user' | 'tool'>,
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
    ...(selectedContentPartIndices == null && message.content == null && storedText != null
      ? { text: storedText }
      : {}),
    ...(attribution === 'user' && {
      isCreatedByUser: true,
      isUserSubmitted: true,
    }),
    ...(attribution === 'tool' && {
      role: 'tool',
      isCreatedByUser: false,
      isUserSubmitted: false,
    }),
  };
  const messageContent = message.content;
  if (!Array.isArray(messageContent)) {
    return providerMessage;
  }
  const projectPart = (
    part: NonNullable<StoredMessageContentInput['content']>[number],
  ): NonNullable<StoredMessageContentInput['content']>[number] => {
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
  };
  if (selectedContentPartIndices == null) {
    return {
      ...providerMessage,
      content: messageContent.map(projectPart),
    };
  }

  const selectedIndices = [...selectedContentPartIndices]
    .filter((index) => Number.isSafeInteger(index) && index >= 0 && index < messageContent.length)
    .sort((left, right) => left - right);
  const compactIndexBySourceIndex = new Map<number, number>();
  const content: Array<NonNullable<StoredMessageContentInput['content']>[number]> = [];
  for (const sourceIndex of selectedIndices) {
    const part = messageContent[sourceIndex];
    if (part == null) {
      continue;
    }
    compactIndexBySourceIndex.set(sourceIndex, content.length);
    content.push(projectPart(part));
  }
  const remapSelectedPath = (value: unknown): JsonPointer | undefined => {
    if (typeof value !== 'string' || !value.startsWith('/')) {
      return undefined;
    }
    const segments = getSafeUserSubmittedPathSegments(value as JsonPointer);
    const encodedIndex = segments?.[1];
    if (
      segments?.[0] !== 'content' ||
      encodedIndex == null ||
      !/^\d+$/.test(encodedIndex) ||
      String(Number(encodedIndex)) !== encodedIndex
    ) {
      return undefined;
    }
    const compactIndex = compactIndexBySourceIndex.get(Number(encodedIndex));
    if (compactIndex == null) {
      return undefined;
    }
    const sourcePrefix = `/content/${encodedIndex}`;
    return `/content/${compactIndex}${value.slice(sourcePrefix.length)}` as JsonPointer;
  };
  const userSubmittedPaths = (message.userSubmittedPaths ?? [])
    .map(remapSelectedPath)
    .filter((path): path is JsonPointer => path != null);
  const userSubmittedMessageFieldPaths: UserSubmittedMessageFieldPath[] = [];
  for (const entry of message.userSubmittedMessageFieldPaths ?? []) {
    const path = remapSelectedPath(entry?.path);
    if (path != null) {
      userSubmittedMessageFieldPaths.push({ ...entry, path });
    }
  }
  return {
    ...providerMessage,
    userSubmittedPaths,
    userSubmittedMessageFieldPaths,
    content,
  };
}

interface StoredProviderContributionState {
  readonly isCanonicalUserContribution: boolean;
}

interface CachedStoredProviderState {
  readonly submittedMessageFieldState: ReturnType<typeof getUserSubmittedMessageFieldPathState>;
  readonly explicitSubmittedPaths: ReadonlySet<string>;
  wholeSubmittedPathState?: ReturnType<typeof getUserSubmittedPathState>;
  wholeRawFileIds?: ReadonlySet<string>;
}

function getStoredSubmittedPathState(
  message: StoredModelBoundMessage,
  selectedContentPartIndices: ReadonlySet<number> | undefined,
  cachedState: CachedStoredProviderState,
): ReturnType<typeof getUserSubmittedPathState> {
  if (selectedContentPartIndices != null) {
    return getUserSubmittedPathState(message, {
      semanticContentPartIndices: selectedContentPartIndices,
    });
  }
  if (cachedState.wholeSubmittedPathState == null) {
    cachedState.wholeSubmittedPathState = getUserSubmittedPathState(message);
  }
  return cachedState.wholeSubmittedPathState;
}

function pathIntersectsSelectedContentParts(
  path: string,
  selectedContentPartIndices: ReadonlySet<number> | undefined,
): boolean {
  if (selectedContentPartIndices == null) {
    return true;
  }
  const segments = path.startsWith('/')
    ? getSafeUserSubmittedPathSegments(path as JsonPointer)
    : undefined;
  return (
    segments?.[0] === 'content' &&
    /^\d+$/.test(segments[1] ?? '') &&
    selectedContentPartIndices.has(Number(segments[1]))
  );
}

function getStoredProviderContributionState(
  message: StoredModelBoundMessage,
  selectedContentPartIndices: ReadonlySet<number> | undefined,
  cachedState: CachedStoredProviderState,
): StoredProviderContributionState {
  const submittedPathState = getStoredSubmittedPathState(
    message,
    selectedContentPartIndices,
    cachedState,
  );
  let hasSelectedMaterial = selectedContentPartIndices == null;
  if (!hasSelectedMaterial && Array.isArray(message.content)) {
    for (const index of selectedContentPartIndices ?? []) {
      if (message.content[index] != null) {
        hasSelectedMaterial = true;
        break;
      }
    }
  }
  const hasSelectedSubmittedPath = submittedPathState.paths.some((path) =>
    pathIntersectsSelectedContentParts(path, selectedContentPartIndices),
  );
  const hasSelectedSubmittedField = cachedState.submittedMessageFieldState.entries.some((entry) =>
    pathIntersectsSelectedContentParts(entry.path, selectedContentPartIndices),
  );
  const hasSubmittedCanonicalProvenance =
    hasSelectedSubmittedPath ||
    hasSelectedSubmittedField ||
    (hasSelectedMaterial &&
      (submittedPathState.overflowed || cachedState.submittedMessageFieldState.overflowed));
  const storedRole = normalizeRole(message);
  const isStoredUserSource =
    hasSelectedMaterial &&
    (message.isCreatedByUser === true || message.isUserSubmitted === true || storedRole === 'user');
  return {
    isCanonicalUserContribution: isStoredUserSource || hasSubmittedCanonicalProvenance,
  };
}

function getSelectedRawStoredMessageFileIds(
  message: StoredModelBoundMessage,
  selectedContentPartIndices: ReadonlySet<number> | undefined,
  cachedState: CachedStoredProviderState,
): ReadonlySet<string> {
  if (selectedContentPartIndices == null) {
    if (cachedState.wholeRawFileIds != null) {
      return cachedState.wholeRawFileIds;
    }
    const fileIds = new Set<string>();
    appendReferencedFileIds(fileIds, message.files);
    for (const part of message.content ?? []) {
      if (part != null) {
        appendPartFileIds(fileIds, part);
      }
    }
    cachedState.wholeRawFileIds = fileIds;
    return fileIds;
  }
  const fileIds = new Set<string>();
  for (const index of selectedContentPartIndices) {
    const part = message.content?.[index];
    if (part != null) {
      appendPartFileIds(fileIds, part);
    }
  }
  return fileIds;
}

function appendMaterializedSelectedFileIds(
  target: Set<string>,
  materializedFileIds: readonly string[] | undefined,
  rawSelectedFileIds: ReadonlySet<string>,
): void {
  for (const candidate of materializedFileIds ?? []) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const fileId = candidate.trim();
    if (fileId.length > 0 && rawSelectedFileIds.has(fileId)) {
      target.add(fileId);
    }
  }
}

interface ModelBoundProviderContentIndex {
  readonly storedMessagesById: ReadonlyMap<string, StoredModelBoundMessage>;
  readonly resolvedFilesById: ReadonlyMap<string, ModelBoundCanonicalFile>;
  readonly storedStateByMessage: WeakMap<StoredModelBoundMessage, CachedStoredProviderState>;
}

function getCachedStoredProviderState(
  index: ModelBoundProviderContentIndex,
  message: StoredModelBoundMessage,
): CachedStoredProviderState {
  const cached = index.storedStateByMessage.get(message);
  if (cached != null) {
    return cached;
  }
  const state: CachedStoredProviderState = {
    submittedMessageFieldState: getUserSubmittedMessageFieldPathState(message),
    explicitSubmittedPaths: new Set(
      (message.userSubmittedPaths ?? []).filter((path): path is string => typeof path === 'string'),
    ),
  };
  index.storedStateByMessage.set(message, state);
  return state;
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
  return {
    storedMessagesById,
    resolvedFilesById,
    storedStateByMessage: new WeakMap(),
  };
}

function projectModelBoundProviderContent(
  input: ModelBoundProviderContentInput,
  index: ModelBoundProviderContentIndex,
): {
  storedMessages: StoredModelBoundMessage[];
  resolvedFiles: ModelBoundCanonicalFile[];
  deferredTraversalErrors: ContentTraversalLimitError[];
} {
  const selectedMessages: StoredModelBoundMessage[] = [];
  const selectedStoredMessages = new Set<StoredModelBoundMessage>();
  const selectedFileIds = new Set<string>();
  const deferredTraversalErrors: ContentTraversalLimitError[] = [];
  const selectLegacyStoredMessage = (message: StoredModelBoundMessage): void => {
    if (selectedStoredMessages.has(message)) {
      return;
    }
    selectedStoredMessages.add(message);
    selectedMessages.push(projectStoredMessageForProvider(message));
  };
  for (let providerIndex = 0; providerIndex < input.providerMessages.length; providerIndex++) {
    const providerMessage = input.providerMessages[providerIndex];
    const providerRole = normalizeRole(providerMessage);
    const provenanceState = getProviderMessageProvenanceState(providerMessage);
    let exactHasUserAttribution = false;
    let exactHasToolAttribution = false;

    if (provenanceState.value != null) {
      const orderedContributions = getOrderedProviderSourceContributions(provenanceState.value);
      exactHasUserAttribution = orderedContributions.hasUserAttribution;
      exactHasToolAttribution = orderedContributions.hasToolAttribution;
      for (const contribution of orderedContributions.contributions) {
        const storedMessage = index.storedMessagesById.get(contribution.sourceMessageId);
        if (storedMessage == null) {
          continue;
        }
        const cachedState = getCachedStoredProviderState(index, storedMessage);
        const contributionState = getStoredProviderContributionState(
          storedMessage,
          contribution.selectedContentPartIndices,
          cachedState,
        );
        exactHasUserAttribution ||= contributionState.isCanonicalUserContribution;
        const needsCanonicalProvenance =
          contribution.attribution === 'user' ||
          contribution.attribution === 'tool' ||
          contributionState.isCanonicalUserContribution ||
          (input.filters?.messages?.unattributedAssistantContent === 'inspect' &&
            providerRole === 'assistant');
        if (needsCanonicalProvenance) {
          selectedMessages.push(
            projectStoredMessageForProvider(
              storedMessage,
              contribution.selectedContentPartIndices,
              contribution.attribution === 'user' || contribution.attribution === 'tool'
                ? contribution.attribution
                : undefined,
            ),
          );
        }
        if (
          contribution.attribution === 'user' ||
          contribution.attribution === 'tool' ||
          contributionState.isCanonicalUserContribution
        ) {
          appendMaterializedSelectedFileIds(
            selectedFileIds,
            input.fileIdsBySourceMessageId?.get(contribution.sourceMessageId),
            getSelectedRawStoredMessageFileIds(
              storedMessage,
              contribution.selectedContentPartIndices,
              cachedState,
            ),
          );
        }
      }
    } else {
      const legacyLineage = getLegacyProviderLineage(providerMessage);
      const matchedStoredMessages = new Set<StoredModelBoundMessage>();
      let hasSubmittedCanonicalSource = false;
      for (const sourceId of legacyLineage.sourceIds) {
        const storedMessage = index.storedMessagesById.get(sourceId);
        if (storedMessage == null) {
          continue;
        }
        matchedStoredMessages.add(storedMessage);
        const cachedState = getCachedStoredProviderState(index, storedMessage);
        const submittedPathState = getStoredSubmittedPathState(
          storedMessage,
          undefined,
          cachedState,
        );
        const storedRole = normalizeRole(storedMessage);
        const isStoredUserSource =
          storedMessage.isCreatedByUser === true ||
          storedMessage.isUserSubmitted === true ||
          storedRole === 'user';
        const hasStoredSubmittedProvenance =
          submittedPathState.overflowed ||
          cachedState.submittedMessageFieldState.overflowed ||
          submittedPathState.paths.some(
            (path) =>
              cachedState.explicitSubmittedPaths.has(path) &&
              !isSteerSubmittedPath(storedMessage, path),
          ) ||
          cachedState.submittedMessageFieldState.entries.length > 0;
        hasSubmittedCanonicalSource ||= isStoredUserSource || hasStoredSubmittedProvenance;
        const needsCanonicalProvenance =
          isStoredUserSource ||
          hasStoredSubmittedProvenance ||
          providerRole === 'user' ||
          (input.filters?.messages?.unattributedAssistantContent === 'inspect' &&
            providerRole === 'assistant');
        if (needsCanonicalProvenance) {
          selectLegacyStoredMessage(storedMessage);
        }
        if (isStoredUserSource || hasStoredSubmittedProvenance || providerRole === 'user') {
          for (const fileId of input.fileIdsBySourceMessageId?.get(sourceId) ?? []) {
            if (typeof fileId === 'string' && fileId.length > 0) {
              selectedFileIds.add(fileId);
            }
          }
        }
      }

      const lineageError = getLegacyCoalescedLineageError(
        input,
        providerMessage,
        matchedStoredMessages,
        provenanceState,
        legacyLineage,
      );
      if (lineageError != null) {
        deferredTraversalErrors.push(lineageError);
      }

      if (provenanceState.invalid) {
        for (const attribution of ['user', 'tool'] as const) {
          const projectedMessage = projectProviderMessage(providerMessage, attribution);
          selectedMessages.push(projectedMessage);
          appendStoredMessageFileIds(selectedFileIds, projectedMessage, input.filters);
        }
        continue;
      }

      const isLegacyArtifactHuman = isLegacyArtifactProjectionHuman(
        input.providerMessages,
        providerIndex,
        provenanceState,
        legacyLineage,
      );
      let projectedMessage = projectProviderMessage(
        providerMessage,
        isLegacyArtifactHuman ? 'tool' : undefined,
      );
      if (
        !isLegacyArtifactHuman &&
        (providerRole === 'user' || providerRole === 'assistant') &&
        hasSubmittedCanonicalSource
      ) {
        projectedMessage = {
          ...projectedMessage,
          isCreatedByUser: true,
          isUserSubmitted: true,
        };
      }
      selectedMessages.push(projectedMessage);
      appendStoredMessageFileIds(selectedFileIds, projectedMessage, input.filters);
      continue;
    }

    /** Typed provenance is authoritative for attribution and source selection.
     * Cross-boundary payloads are inspected under every applicable external
     * source, while all-model/synthetic Human projections remain non-user. */
    const exactAttributions: ProviderExactAttribution[] = [];
    if (exactHasUserAttribution) {
      exactAttributions.push('user');
    }
    if (exactHasToolAttribution) {
      exactAttributions.push('tool');
    }
    if (exactAttributions.length === 0) {
      exactAttributions.push('non_user');
    }
    for (const attribution of exactAttributions) {
      const projectedMessage = projectProviderMessage(providerMessage, attribution);
      selectedMessages.push(projectedMessage);
      appendStoredMessageFileIds(selectedFileIds, projectedMessage, input.filters);
    }
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
  return { storedMessages: selectedMessages, resolvedFiles, deferredTraversalErrors };
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
    deferredTraversalErrors: projection.deferredTraversalErrors,
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

  const callback: InitialModelBoundAdmissionCallback = {
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
  };
  return Object.freeze(callback);
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
  const inspectionSession = inspector?.createSession();
  let finding: ReturnType<NonNullable<typeof inspectionSession>['inspect']> = null;
  const inspectFragments = (fragments: Iterable<TextContentFragment>): void => {
    if (finding == null) {
      finding = inspectionSession?.inspect(fragments) ?? null;
    }
  };
  const inspectFragment = (fragment: TextContentFragment): void => {
    if (finding == null) {
      finding = inspectionSession?.inspectFragment(fragment) ?? null;
    }
  };
  const traversalErrors: ContentTraversalLimitError[] = [...(input.deferredTraversalErrors ?? [])];
  const appendExtractedContent = (extract: () => readonly TextContentFragment[]) => {
    try {
      inspectFragments(extract());
    } catch (error) {
      if (!isContentTraversalLimitError(error)) {
        throw error;
      }
      inspectFragments(getContentTraversalFragments(error));
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
    inspectFragments(
      extractFileContent(typeof file === 'string' ? { content: file, text: file } : file),
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
        inspectFragment(fragment);
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
      if (finding == null) {
        const submittedPathSet = new Set<string>(userSubmittedPaths);
        for (const fragment of messageFragments) {
          if (fragment.source === 'tool_argument') {
            inspectFragment(fragment);
            if (finding != null) {
              break;
            }
          }
        }
        if (finding == null) {
          const submittedToolOutputs: Array<
            Extract<TextContentFragment, { source: 'tool_argument' }>
          > = [];
          const assembledText: string[] = [];
          for (const fragment of messageFragments) {
            if (!isFragmentWithinSubmittedPaths(fragment, submittedPathSet)) {
              continue;
            }
            if (fragment.source !== 'tool_argument') {
              inspectFragment(fragment);
              if (finding != null) {
                break;
              }
            }
            if (
              fragment.source === 'message' &&
              (fragment.field === 'text' || fragment.field === 'content_part')
            ) {
              assembledText.push(fragment.text);
            } else if (fragment.source === 'tool_argument' && fragment.field === 'output') {
              submittedToolOutputs.push(fragment);
              assembledText.push(fragment.text);
            }
          }
          if (finding == null) {
            for (const fragment of submittedToolOutputs) {
              inspectFragment(asUserSubmittedMessageFragment(fragment));
              if (finding != null) {
                break;
              }
            }
          }
          if (finding == null) {
            inspectFragments(exactMessageFragments);
          }
          if (finding == null) {
            const userSubmittedAssembledContext =
              createUserSubmittedAssembledContext(assembledText);
            if (userSubmittedAssembledContext != null) {
              inspectFragment(userSubmittedAssembledContext);
            }
          }
        }
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
    inspectFragments(messageFragments);
    inspectFragments(exactMessageFragments);
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
    inspectFragments(extractMemoryContent(typeof memory === 'string' ? { value: memory } : memory));
  }
  for (const file of input.files ?? []) {
    appendFile(file);
  }

  if (finding != null) {
    throw new ContentFilterError(finding);
  }
  if (traversalErrors.length > 0) {
    throw traversalErrors[0];
  }
}
