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

type StoredConversationDecision = Pick<
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
  const ownsConversation = conversation != null && conversation.conversationId === conversationId;
  const persistedMode = ownsConversation ? conversation.codeEnvironmentMode : undefined;
  const persistedSelections = ownsConversation ? conversation.codeWorkspaces : undefined;
  let inferredPersistedMode: unknown = persistedMode;
  if (inferredPersistedMode == null && ownsConversation) {
    inferredPersistedMode = persistedSelections?.length ? 'attached' : 'without_attached';
  }

  if (inferredPersistedMode != null) {
    const persisted = validateDecision(inferredPersistedMode, persistedSelections);
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
