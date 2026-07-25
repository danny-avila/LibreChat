import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type {
  AgentContentInput,
  AssistantActionContentInput,
  AssistantContentInput,
  FileContentInput,
  MemoryContentInput,
  SkillContentInput,
  StoredMessageContentInput,
} from '../protection/adapters/submissions';
import type { ContentTraversalLimitError } from '../protection/adapters/nested';
import type { JsonPointer, TextContentFragment } from '../protection/types';
import type { ExternalChatMessage } from '../protection/adapters/messages';
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
  allowHydratedFileReferences,
  assertHydratedFileInspectable,
  getBlockedOpaqueFileField,
  getBlockedUninspectableFileField,
  omitResolvedCanonicalFileLocators,
  UninspectableFileError,
} from '../protection/files';
import {
  getContentTraversalFragments,
  isContentTraversalLimitError,
  isNestedMessageTraversalProtected,
} from '../protection/adapters/nested';
import { createConfiguredContentInspector } from '../protection/runtime';
import { extractMessageContent } from '../protection/adapters/messages';
import { ContentFilterError } from './contentFilter';

type ModelBoundMessage = ExternalChatMessage & {
  readonly _getType?: () => string;
};

type StoredModelBoundMessage = StoredMessageContentInput & {
  readonly isCreatedByUser?: boolean;
  readonly isUserSubmitted?: boolean;
  readonly userSubmittedPaths?: readonly string[];
};

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
  readonly resolvedFiles?: readonly (FileContentInput | null | undefined)[];
}

function normalizeRole(message: ModelBoundMessage): string | undefined {
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

function getHydratedAgentFiles(agent: AgentContentInput | null | undefined): FileContentInput[] {
  if (agent == null) {
    return [];
  }
  const runtimeAgent = agent as RuntimeAgentFileContainer;
  const files: FileContentInput[] = [];
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

const MAX_USER_SUBMITTED_PATHS = 256;
const MAX_USER_SUBMITTED_PATH_LENGTH = 2048;
const blockedPointerSegments = new Set(['__proto__', 'constructor', 'prototype']);

interface NormalizedUserSubmittedPaths {
  readonly paths: JsonPointer[];
  readonly overflowed: boolean;
}

function normalizeUserSubmittedPaths(
  paths: readonly string[] | undefined,
): NormalizedUserSubmittedPaths {
  const normalized: JsonPointer[] = [];
  const seen = new Set<string>();
  for (const path of paths ?? []) {
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.length > MAX_USER_SUBMITTED_PATH_LENGTH ||
      seen.has(path)
    ) {
      continue;
    }
    seen.add(path);
    if (normalized.length >= MAX_USER_SUBMITTED_PATHS) {
      return { paths: normalized, overflowed: true };
    }
    normalized.push(path as JsonPointer);
  }
  return { paths: normalized, overflowed: false };
}

function getSemanticUserSubmittedPaths(message: StoredModelBoundMessage): JsonPointer[] {
  const paths: JsonPointer[] = [];
  for (let index = 0; index < (message.content?.length ?? 0); index++) {
    if (message.content?.[index]?.type === 'steer') {
      paths.push(`/content/${index}` as JsonPointer);
    }
  }
  return paths;
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

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
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
    const segments = path.slice(1).split('/').map(decodeJsonPointerSegment);
    if (segments.length === 0 || segments.some((segment) => blockedPointerSegments.has(segment))) {
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
  const resolvedFileIds = new Set<string>();
  const appendFile = (file: FileContentInput | string | null | undefined): string | undefined => {
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
    return isHydratedCanonicalFile ? (file as { file_id: string }).file_id : undefined;
  };
  for (const file of input.resolvedFiles ?? []) {
    const fileId = appendFile(file);
    if (fileId != null) {
      resolvedFileIds.add(fileId);
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
    const normalizedPaths = normalizeUserSubmittedPaths([
      ...(message.userSubmittedPaths ?? []),
      ...getSemanticUserSubmittedPaths(message),
    ]);
    const isEntireMessageUserSubmitted =
      message?.isCreatedByUser === true ||
      message?.isUserSubmitted === true ||
      normalizedPaths.overflowed;
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
    if (!isEntireMessageUserSubmitted) {
      const userSubmittedPaths = normalizedPaths.paths;
      const projectedMessage = projectUserSubmittedPaths(message, userSubmittedPaths);
      if (projectedMessage != null) {
        assertInspectableFileInput(
          input.filters,
          omitResolvedCanonicalFileLocators(projectedMessage, resolvedFileIds),
        );
      }
      /** Legacy unmarked assistant rows are treated as model-generated to avoid
       *  retroactively blocking model output. Structured tool calls/results
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
          isNestedMessageTraversalProtected({
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
    fragments.push(...messageFragments);
    if (
      traversalError != null &&
      isNestedMessageTraversalProtected({
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
    omitResolvedCanonicalFileLocators(storedUserMessages, resolvedFileIds),
  );
  for (const agent of input.agents ?? []) {
    const resolvedFileIds = new Set<string>();
    for (const file of getHydratedAgentFiles(agent)) {
      const fileId = appendFile(file);
      if (fileId != null) {
        resolvedFileIds.add(fileId);
      }
    }
    assertInspectableFileInput(
      input.filters,
      omitResolvedCanonicalFileLocators(agent, resolvedFileIds),
    );
    fragments.push(...extractAgentContent(agent));
  }
  for (const assistant of input.assistants ?? []) {
    assertInspectableFileInput(input.filters, assistant);
    fragments.push(...extractAssistantContent(assistant));
  }
  for (const action of input.actions ?? []) {
    fragments.push(...extractAssistantActionContent(action));
  }
  for (const skill of input.skills ?? []) {
    fragments.push(...extractSkillContent(skill));
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
