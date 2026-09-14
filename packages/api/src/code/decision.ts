import { isCodeEnvironmentMode, isCodeWorkspaceSelections } from 'librechat-data-provider';
import type {
  CodeEnvironmentMode,
  CodeWorkspaceSelection,
  TConversation,
} from 'librechat-data-provider';
import { CodeWorkspaceSelectionError } from './capabilities';

export interface ConversationCodeEnvironmentDecision {
  mode: CodeEnvironmentMode;
  codeWorkspaces?: CodeWorkspaceSelection[];
}

export type StoredConversationDecision = Pick<
  TConversation,
  'conversationId' | 'codeEnvironmentMode' | 'codeWorkspaces'
>;

function canonicalSelections(selections: CodeWorkspaceSelection[]): CodeWorkspaceSelection[] {
  return [...selections].sort((left, right) => {
    if (left.environmentId < right.environmentId) return -1;
    if (left.environmentId > right.environmentId) return 1;
    if (left.workspaceId < right.workspaceId) return -1;
    if (left.workspaceId > right.workspaceId) return 1;
    return 0;
  });
}

function sameSelections(left: CodeWorkspaceSelection[], right: CodeWorkspaceSelection[]): boolean {
  return JSON.stringify(canonicalSelections(left)) === JSON.stringify(canonicalSelections(right));
}

function validateDecision(mode: unknown, selections: unknown): ConversationCodeEnvironmentDecision {
  if (!isCodeEnvironmentMode(mode)) {
    throw new CodeWorkspaceSelectionError('invalid');
  }
  if (mode === 'without_attached') {
    if (
      selections !== undefined &&
      (!isCodeWorkspaceSelections(selections) || selections.length > 0)
    ) {
      throw new CodeWorkspaceSelectionError('invalid');
    }
    return { mode };
  }
  if (!isCodeWorkspaceSelections(selections) || selections.length === 0) {
    throw new CodeWorkspaceSelectionError('required');
  }
  return { mode, codeWorkspaces: canonicalSelections(selections) };
}

/** A stored conversation always carries a decision; legacy rows infer it from their selections. */
function readPersistedDecision(
  conversation: StoredConversationDecision,
): ConversationCodeEnvironmentDecision {
  const mode =
    conversation.codeEnvironmentMode ??
    (conversation.codeWorkspaces?.length ? 'attached' : 'without_attached');
  return validateDecision(mode, conversation.codeWorkspaces);
}

/** Resolves one immutable conversation choice before attached tools are registered. */
export function resolveConversationCodeEnvironmentDecision({
  conversationId,
  requestedMode,
  requestedSelections,
  conversation,
}: {
  conversationId: string;
  requestedMode?: unknown;
  requestedSelections?: unknown;
  conversation?: StoredConversationDecision | null;
}): ConversationCodeEnvironmentDecision {
  if (conversation != null && conversation.conversationId === conversationId) {
    const persisted = readPersistedDecision(conversation);
    if (requestedMode !== undefined && requestedMode !== persisted.mode) {
      throw new CodeWorkspaceSelectionError('locked');
    }
    if (
      persisted.mode === 'attached' &&
      requestedSelections !== undefined &&
      (!isCodeWorkspaceSelections(requestedSelections) ||
        !sameSelections(requestedSelections, persisted.codeWorkspaces ?? []))
    ) {
      throw new CodeWorkspaceSelectionError('locked');
    }
    if (
      persisted.mode === 'without_attached' &&
      requestedSelections !== undefined &&
      (!isCodeWorkspaceSelections(requestedSelections) || requestedSelections.length > 0)
    ) {
      throw new CodeWorkspaceSelectionError('locked');
    }
    return persisted;
  }

  if (requestedMode !== undefined && !isCodeEnvironmentMode(requestedMode)) {
    throw new CodeWorkspaceSelectionError('invalid');
  }
  const mode =
    requestedMode ??
    (isCodeWorkspaceSelections(requestedSelections) && requestedSelections.length > 0
      ? 'attached'
      : 'without_attached');
  return validateDecision(mode, requestedSelections);
}

export interface ConversationCodeEnvironmentMove {
  codeWorkspaces: CodeWorkspaceSelection[];
}

/**
 * Validates an owner's explicit move of a sealed attached decision onto the environments its
 * agents now use. A move may drop environments the agents stopped using and add ones they now use,
 * but never changes the workspace of an environment the decision already covers and never upgrades
 * a conversation that continues without an attached environment. `from` must repeat the persisted selections, so a client acting
 * on a stale view of the conversation cannot replace a decision it has not seen.
 */
export function resolveConversationCodeEnvironmentMove({
  conversation,
  from,
  to,
}: {
  conversation: StoredConversationDecision;
  from: unknown;
  to: unknown;
}): ConversationCodeEnvironmentMove {
  const persisted = readPersistedDecision(conversation);
  if (persisted.mode !== 'attached' || persisted.codeWorkspaces == null) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  if (!isCodeWorkspaceSelections(from) || !sameSelections(from, persisted.codeWorkspaces)) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  if (!isCodeWorkspaceSelections(to) || to.length === 0) {
    throw new CodeWorkspaceSelectionError('invalid');
  }
  const sealed = new Map(
    persisted.codeWorkspaces.map(({ environmentId, workspaceId }) => [environmentId, workspaceId]),
  );
  let adds = false;
  for (const selection of to) {
    const sealedWorkspaceId = sealed.get(selection.environmentId);
    if (sealedWorkspaceId == null) {
      adds = true;
    } else if (sealedWorkspaceId !== selection.workspaceId) {
      throw new CodeWorkspaceSelectionError('locked');
    }
  }
  if (!adds && to.length === sealed.size) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  return { codeWorkspaces: canonicalSelections(to) };
}

/**
 * Returns the decision fields a run may persist. A stored conversation keeps the decision it
 * already holds, because only its owner's explicit move replaces one: a run from any ingress that
 * settles after a move would otherwise write its run-start decision back over it. A legacy row
 * records the mode it inferred without touching the selections it already stores.
 */
export function resolvePersistableCodeEnvironmentDecision({
  conversationId,
  decision,
  conversation,
}: {
  conversationId: string;
  decision?: ConversationCodeEnvironmentDecision | null;
  conversation?: StoredConversationDecision | null;
}): Pick<StoredConversationDecision, 'codeEnvironmentMode' | 'codeWorkspaces'> {
  if (decision == null) {
    return {};
  }
  if (conversation == null || conversation.conversationId !== conversationId) {
    return {
      codeEnvironmentMode: decision.mode,
      ...(decision.codeWorkspaces != null && { codeWorkspaces: decision.codeWorkspaces }),
    };
  }
  return conversation.codeEnvironmentMode == null ? { codeEnvironmentMode: decision.mode } : {};
}
