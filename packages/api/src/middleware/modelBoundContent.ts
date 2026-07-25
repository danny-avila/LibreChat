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
import { extractMessageContent } from '../protection/adapters/messages';
import { getBlockedOpaqueFileField, UninspectableFileError } from '../protection/files';
import type { TextContentFragment } from '../protection/types';
import { inspectContent } from '../protection/runtime';
import { ContentFilterError } from './contentFilter';

type ModelBoundMessage = ExternalChatMessage & {
  readonly _getType?: () => string;
};

type StoredModelBoundMessage = StoredMessageContentInput & {
  readonly isCreatedByUser?: boolean;
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

/**
 * Re-inspects the final model-bound representation. This makes a newly
 * enabled or tightened policy apply to persisted messages and reusable
 * agent/skill/memory/file context, not only to the request that created it.
 */
export function assertModelBoundContent(input: ModelBoundContentInput): void {
  if (input.filters == null && input.legacyPii == null) {
    return;
  }
  const fragments: TextContentFragment[] = [];
  if (input.submittedMessages != null) {
    assertInspectableFileInput(input.filters, input.submittedMessages);
    fragments.push(
      ...extractMessageContent(
        input.submittedMessages.map((message) => ({
          ...message,
          role: normalizeRole(message),
          content: message.content,
        })),
      ),
    );
  }
  const storedUserMessages: StoredModelBoundMessage[] = [];
  for (const message of input.storedMessages ?? []) {
    const messageFragments = extractStoredMessageContent(message);
    if (message?.isCreatedByUser !== true) {
      /** Persisted assistant prose is model-generated, but structured tool
       *  calls/results remain externally sourced model-bound content. Reapply
       *  only the tool policy without misclassifying assistant text as a user
       *  message. */
      fragments.push(...messageFragments.filter((fragment) => fragment.source === 'tool_argument'));
      continue;
    }
    storedUserMessages.push(message);
    fragments.push(...messageFragments);
  }
  assertInspectableFileInput(input.filters, storedUserMessages);
  for (const agent of input.agents ?? []) {
    assertInspectableFileInput(input.filters, agent);
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
    assertInspectableFileInput(input.filters, file);
    fragments.push(
      ...extractFileContent(typeof file === 'string' ? { content: file, text: file } : file),
    );
  }

  const finding = inspectContent(fragments, {
    filters: input.filters,
    legacyPii: input.legacyPii,
  });
  if (finding != null) {
    throw new ContentFilterError(finding);
  }
}
