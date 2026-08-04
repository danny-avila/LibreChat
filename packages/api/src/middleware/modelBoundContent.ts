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
import { createConfiguredContentInspector } from '../protection/runtime';
import { extractMessageContent } from '../protection/adapters/messages';
import { ContentFilterError } from './contentFilter';

type ModelBoundMessage = ExternalChatMessage & {
  readonly _getType?: () => string;
};

type StoredModelBoundMessage = StoredMessageContentInput & {
  readonly messageId?: string;
  readonly isCreatedByUser?: boolean;
  readonly isUserSubmitted?: boolean;
  readonly userSubmittedPaths?: readonly string[];
  readonly userSubmittedMessageFieldPaths?: readonly UserSubmittedMessageFieldPath[];
};

type ModelBoundCanonicalFile = FileContentInput & CanonicalFileInspectionFile;

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
