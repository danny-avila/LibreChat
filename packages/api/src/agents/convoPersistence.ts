/**
 * What a turn's message writes reported about the conversation row.
 *
 * `saveMessageToDatabase` writes a message and upserts its conversation, and
 * resolves with both. That result is the only in-band evidence the row exists,
 * and two things in a resumable turn depend on it:
 *
 * - An immediate-mode title is generated in parallel with the response, so it can
 *   resolve before the row exists, and its `saveConvo` runs with `noUpsert` — a
 *   silent no-op against a missing row. It waits on `ready`, which opens as soon
 *   as a write reports the row. Waiting for the end of the turn instead leaves the
 *   database on `New Chat` for the whole run, and every reader that does not hold
 *   the live stream reads that.
 * - A user-message write that failed is swallowed by BaseClient and retried later
 *   as a bare message row, which does not append its id to the conversation. The
 *   caller asks `reportedConversation()` whether the original write ever recorded
 *   one, and repairs the reference when it did not.
 */
export interface ConvoPersistenceSignal {
  /** Awaited by title persistence; resolves once the conversation row exists. */
  readonly ready: Promise<void>;
  /** Opens `ready` unconditionally. The caller knows the row is written. */
  open(): void;
  /**
   * Records what a message write reported. A write that rejects, never settles,
   * or persisted no conversation leaves `ready` shut for the caller's own
   * `open()` to settle, and leaves `reportedConversation()` false: a title
   * written against a row that does not exist is a title silently dropped.
   */
  observeMessageWrite(write: unknown): void;
  /**
   * Whether any observed write has reported a persisted conversation. False also
   * means "not yet", so read it only once the writes it observes have settled.
   */
  reportedConversation(): boolean;
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

export function createConvoPersistenceSignal(): ConvoPersistenceSignal {
  let openGate: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  let reported = false;

  return {
    ready,
    open: () => openGate(),
    reportedConversation: () => reported,
    observeMessageWrite: (write: unknown) => {
      if (write == null || typeof (write as PromiseLike<unknown>).then !== 'function') {
        return;
      }
      void Promise.resolve(write as PromiseLike<unknown>).then(
        (result) => {
          if (persistedConversationId(result) != null) {
            reported = true;
            openGate();
          }
        },
        /** The write's own owner logs and recovers it; the signal only learns that
         *  nothing was persisted. */
        () => {},
      );
    },
  };
}
