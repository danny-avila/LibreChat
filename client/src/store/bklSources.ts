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
  /** LibreChat message id that owns the `[N]` marker the user clicked. */
  messageId: string;
  /** 1-indexed citation number, matching the `[N]` in the assistant text. */
  n: number;
};

export const activeBklSource = atom<ActiveBklSource | null>({
  key: 'activeBklSource',
  default: null,
});
