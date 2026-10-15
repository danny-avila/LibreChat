import { atomFamily, atomWithStorage, createJSONStorage } from 'jotai/utils';
import type { RecoveryDispositions } from '@librechat/chat';

export { blockRecovery, canRestoreRecovery, recoveryDisposition } from '@librechat/chat';
export type { RecoveryDisposition, RecoveryDispositions } from '@librechat/chat';

/** Receipt-scoped safety decisions survive remounts and reloads in this tab.
 * No message content is stored. A crashed cancellation stays held, not sendable. */
export const recoveryDispositionsFamily = atomFamily((conversationId: string) =>
  atomWithStorage<RecoveryDispositions>(
    `steer-recovery:${conversationId}`,
    {},
    createJSONStorage(
      () => ({
        getItem(key) {
          try {
            return sessionStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem(key, value) {
          try {
            sessionStorage.setItem(key, value);
          } catch {
            /* Keep the in-memory safety decision. */
          }
        },
        removeItem(key) {
          try {
            sessionStorage.removeItem(key);
          } catch {
            /* Storage may be disabled. */
          }
        },
      }),
      {
        reviver: (_key, value) => (value === 'cancelling' ? 'blocked' : value),
      },
    ),
    { getOnInit: true },
  ),
);
