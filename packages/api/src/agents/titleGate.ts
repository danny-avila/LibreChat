/**
 * The wait that stands between a generated conversation title and its row.
 *
 * An immediate-mode title is generated in parallel with the response, so the
 * conversation row may not exist when it resolves, and the title's `saveConvo`
 * runs with `noUpsert` — a silent no-op against a missing row. The gate is what
 * the title waits on, and it opens on the first fact that makes the write
 * durable: the user-message write reporting the conversation it upserted.
 *
 * Opening it there rather than at the end of the turn is the whole point. A turn
 * can run for many minutes, and until the title is in the database every reader
 * that does not hold the live stream — a reloaded tab, a second tab, the sidebar
 * list on any other device — sees the `New Chat` placeholder for as long as the
 * turn lasts.
 */
export interface TitlePersistenceGate {
  /** Awaited by title persistence; resolves once the conversation row exists. */
  readonly ready: Promise<void>;
  /** Opens the gate unconditionally. The caller knows the row is written. */
  open(): void;
  /**
   * Opens the gate once `write` reports a persisted conversation. A write that
   * rejects, never settles, or persisted no conversation leaves the gate shut
   * for the caller's own `open()` to settle: a title written against a row that
   * does not exist is a title silently dropped.
   */
  openWhenConversationPersisted(write: unknown): void;
}

/** What a message write resolves with when it also upserted the conversation. */
type ConversationWrite = {
  conversation?: { conversationId?: string | null } | null;
};

const persistedConversationId = (result: unknown): string | undefined => {
  if (result == null || typeof result !== 'object') {
    return undefined;
  }
  const { conversation } = result as ConversationWrite;
  if (conversation == null || typeof conversation !== 'object') {
    return undefined;
  }
  const { conversationId } = conversation;
  return typeof conversationId === 'string' && conversationId !== '' ? conversationId : undefined;
};

export function createTitlePersistenceGate(): TitlePersistenceGate {
  let openGate: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  return {
    ready,
    open: () => openGate(),
    openWhenConversationPersisted: (write: unknown) => {
      if (write == null || typeof (write as PromiseLike<unknown>).then !== 'function') {
        return;
      }
      void Promise.resolve(write as PromiseLike<unknown>).then(
        (result) => {
          if (persistedConversationId(result) != null) {
            openGate();
          }
        },
        /** The write's own owner logs and recovers it; the gate only learns that
         *  nothing was persisted, and stays shut. */
        () => {},
      );
    },
  };
}
