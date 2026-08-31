import { atom } from 'recoil';

/**
 * BKL source citation UI state.
 *
 * `activeBklSource` is non-null when the user clicked a [N] citation marker
 * and we want the right-side sources drawer to show that specific source.
 *
 * Kept separate from the LibreChat artifacts store so that artifacts and
 * citations can coexist (an artifact could, for example, be a code block
 * while citations are legal-document chunks).
 */

export type ActiveBklSource = {
  /**
   * Route conversation id the chunk was opened from.
   *
   * Without this the atom is conversation-global: opening a chunk in one
   * conversation and then starting a new chat left the old chunk rendered in
   * the drawer, because nothing ever cleared it (2026-08-31 사용자 보고).
   * `useSyncActiveBklSourceWithConversation` clears the atom when this no
   * longer matches the current route.
   *
   * `'new'` while the first answer of a fresh chat is still streaming — that
   * conversation is later promoted to a real id, which is an adoption rather
   * than a conversation change.
   */
  conversationId: string | null;
  /** LibreChat message id that owns the `[N]` marker the user clicked. */
  messageId: string;
  /** 1-indexed citation number, matching the `[N]` in the assistant text. */
  n: number;
};

export const activeBklSource = atom<ActiveBklSource | null>({
  key: 'activeBklSource',
  default: null,
});
