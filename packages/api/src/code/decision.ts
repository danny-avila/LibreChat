import { isCodeEnvironmentMode, isCodeWorkspaceSelections } from 'librechat-data-provider';
import type {
  CodeEnvironmentMode,
  CodeWorkspaceSelection,
  TConversation,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { CodeWorkspaceSelectionError } from './capabilities';
import { resolveCodeEnvironmentMoveVersion } from './config';

export interface ConversationCodeEnvironmentDecision {
  mode: CodeEnvironmentMode;
  codeWorkspaces?: CodeWorkspaceSelection[];
}

export type StoredConversationDecision = Pick<
  TConversation,
  'conversationId' | 'codeEnvironmentMode' | 'codeWorkspaces'
> & { codeEnvironmentRevision?: number };

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

/**
 * Whether the conversation already recorded a decision. A chat whose turns never involved a
 * code-capable agent stores neither field, so it has nothing to seal: switching one to a coding
 * agent still gets to decide. Sealing that state instead would report `without_attached` for a
 * choice its owner never made, and reject the selection they go on to make.
 */
function holdsDecision(conversation: StoredConversationDecision): boolean {
  return conversation.codeEnvironmentMode != null || (conversation.codeWorkspaces?.length ?? 0) > 0;
}

/** Reads the decision a conversation holds; legacy rows infer it from their selections. */
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
  if (
    conversation != null &&
    conversation.conversationId === conversationId &&
    holdsDecision(conversation)
  ) {
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
  mode: CodeEnvironmentMode;
  codeWorkspaces?: CodeWorkspaceSelection[];
}

/**
 * Validates an owner's explicit transition of a sealed decision. Three transitions share these
 * rules, because each one replaces a whole sealed decision with another and none of them touches
 * the chat's messages or copies a file:
 *
 * - a move onto the environments the agents now use, which may drop environments they stopped
 *   using and add ones they now use, but never changes the workspace of an environment the
 *   decision already covers;
 * - an attach, when a chat that continued without an attached environment needs one, which the
 *   sealed `without_attached` decision would otherwise refuse for the life of the chat;
 * - a detach (an empty `to`), when the machine a chat attached to is no longer reachable and its
 *   owner would rather keep chatting than keep waiting for it.
 *
 * `from` must repeat the persisted decision, so a client acting on a stale view of the
 * conversation cannot replace a decision it has not seen. A chat that recorded no decision is not
 * sealed at all: its next turn records one, so there is nothing here to replace.
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
  if (!holdsDecision(conversation)) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  const persisted = readPersistedDecision(conversation);
  const sealed = persisted.codeWorkspaces ?? [];
  if (!isCodeWorkspaceSelections(from) || !sameSelections(from, sealed)) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  if (!isCodeWorkspaceSelections(to)) {
    throw new CodeWorkspaceSelectionError('invalid');
  }
  if (to.length === 0) {
    /** Leaving every attached environment is the detach; a chat already without one cannot. */
    if (persisted.mode !== 'attached') {
      throw new CodeWorkspaceSelectionError('locked');
    }
    return { mode: 'without_attached' };
  }
  if (persisted.mode === 'without_attached') {
    return { mode: 'attached', codeWorkspaces: canonicalSelections(to) };
  }
  const sealedWorkspaces = new Map(
    sealed.map(({ environmentId, workspaceId }) => [environmentId, workspaceId]),
  );
  let adds = false;
  for (const selection of to) {
    const sealedWorkspaceId = sealedWorkspaces.get(selection.environmentId);
    if (sealedWorkspaceId == null) {
      adds = true;
    } else if (sealedWorkspaceId !== selection.workspaceId) {
      throw new CodeWorkspaceSelectionError('locked');
    }
  }
  if (!adds && to.length === sealedWorkspaces.size) {
    throw new CodeWorkspaceSelectionError('locked');
  }
  return { mode: 'attached', codeWorkspaces: canonicalSelections(to) };
}

type PersistableDecisionFields = Pick<
  StoredConversationDecision,
  'codeEnvironmentMode' | 'codeWorkspaces'
>;

/**
 * Returns the decision fields a run may persist. A stored conversation keeps the decision it
 * already holds, because only its owner's explicit move replaces one: a run from any ingress that
 * settles after a move would otherwise write its run-start decision back over it. A legacy row
 * records the mode it inferred without touching the selections it already stores. A caller that
 * never resolved a decision falls back to the fields its request carried, under the same rule.
 */
export function resolvePersistableCodeEnvironmentDecision({
  conversationId,
  decision,
  conversation,
  requested,
}: {
  conversationId: string;
  decision?: ConversationCodeEnvironmentDecision | null;
  conversation?: StoredConversationDecision | null;
  requested?: PersistableDecisionFields | null;
}): PersistableDecisionFields {
  const candidate: PersistableDecisionFields =
    decision != null
      ? {
          codeEnvironmentMode: decision.mode,
          ...(decision.codeWorkspaces != null && { codeWorkspaces: decision.codeWorkspaces }),
        }
      : {
          ...(requested?.codeEnvironmentMode != null && {
            codeEnvironmentMode: requested.codeEnvironmentMode,
          }),
          ...(requested?.codeWorkspaces != null && { codeWorkspaces: requested.codeWorkspaces }),
        };
  if (conversation == null || conversation.conversationId !== conversationId) {
    return candidate;
  }
  /* A saved chat that held no decision records the one this run establishes, selections included:
   * writing the mode alone would leave `attached` without the selections the next turn validates. */
  if (!holdsDecision(conversation)) {
    return candidate;
  }
  if (conversation.codeEnvironmentMode != null || candidate.codeEnvironmentMode == null) {
    return {};
  }
  return { codeEnvironmentMode: candidate.codeEnvironmentMode };
}

/** When moves are enabled, every ingress must publish its active job before calling this and
 * keep it active through the fenced read. Otherwise no transition can race the decision, so reuse
 * the owner-scoped conversation the ingress already loaded instead of writing an unused revision. */
export async function resolveAdmittedCodeEnvironmentDecision({
  appConfig,
  readDecision,
  ...request
}: Parameters<typeof resolveConversationCodeEnvironmentDecision>[0] & {
  appConfig: Pick<AppConfig, 'endpoints'> | undefined;
  readDecision: (conversationId: string) => Promise<StoredConversationDecision | null | undefined>;
}): Promise<{
  decision: ConversationCodeEnvironmentDecision;
  conversation: StoredConversationDecision | null | undefined;
}> {
  const conversation =
    resolveCodeEnvironmentMoveVersion(appConfig) != null
      ? await readDecision(request.conversationId)
      : request.conversation;
  return {
    decision: resolveConversationCodeEnvironmentDecision({ ...request, conversation }),
    // Keep owner-loaded metadata, but never the pre-admission environment fields. An absent
    // stored decision must remain absent; the submitted first choice is not persisted yet.
    conversation:
      conversation == null
        ? conversation
        : {
            ...request.conversation,
            ...conversation,
            codeEnvironmentMode: conversation.codeEnvironmentMode,
            codeWorkspaces: conversation.codeWorkspaces,
          },
  };
}
