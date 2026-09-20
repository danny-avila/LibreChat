import type {
  CodeEnvironmentMode,
  CodeWorkspaceSelection,
  TConversation,
} from 'librechat-data-provider';

function sameSelections(
  left?: CodeWorkspaceSelection[],
  right?: CodeWorkspaceSelection[],
): boolean {
  if (left == null || right == null) return left == null && right == null;
  if (left.length !== right.length) return false;
  const key = ({ environmentId, workspaceId }: CodeWorkspaceSelection) =>
    `${environmentId}:${workspaceId}`;
  const held = new Set(left.map(key));
  return right.every((selection) => held.has(key(selection)));
}

/**
 * Folds the decision a submitted run establishes into the conversation that run belongs to. The
 * server seals this pair for the rest of the chat, so the conversation has to carry it from the
 * moment it is sent: a chat that becomes saved mid-run would otherwise hold no decision while the
 * stored one is already sealed, and the composer would re-derive an agent default or a remembered
 * preference that the sealed decision refuses — reporting "choose a workspace", with Send
 * disabled, for a workspace the run is already using. Returns the same conversation when it
 * already holds the decision, so an unchanged send never re-renders the composer.
 */
export function withSubmittedCodeDecision(
  conversation: TConversation | null,
  submitted: {
    codeEnvironmentMode?: CodeEnvironmentMode;
    codeWorkspaces?: CodeWorkspaceSelection[];
  },
): TConversation | null {
  const { codeEnvironmentMode, codeWorkspaces } = submitted;
  if (conversation == null || codeEnvironmentMode == null) return conversation;
  if (
    conversation.codeEnvironmentMode === codeEnvironmentMode &&
    sameSelections(conversation.codeWorkspaces, codeWorkspaces)
  ) {
    return conversation;
  }
  return { ...conversation, codeEnvironmentMode, codeWorkspaces };
}
