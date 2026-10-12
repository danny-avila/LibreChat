import { QueryKeys } from 'librechat-data-provider';
import { hashQueryKey } from '@tanstack/react-query';
import type { QueryClient, QueryCacheNotifyEvent } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import type { ChatState, ChatStatus, ChatConnection } from '../core';

export type ReactQueryChatStateOptions = {
  queryClient: QueryClient;
  /** The conversation the messages are cached under, `[QueryKeys.messages, key]`. */
  key: string;
} & (
  | { read?: undefined; write?: undefined }
  | {
      /** Reads the list instead of the key's cache entry, for a host that also reads other keys. */
      read: () => TMessage[] | undefined;
      /** Writes the list the same host store `read` reads, so a write is read back. */
      write: (messages: TMessage[]) => void;
    }
);

/** Cache events that add, drop or rewrite a query's data. */
const dataEvents = new Set<QueryCacheNotifyEvent['type']>(['added', 'removed', 'updated']);

/**
 * {@link ChatState} over the React Query message cache, so the chat and every reader of
 * `[QueryKeys.messages, key]` share one list while those readers move onto the chat.
 */
export class ReactQueryChatState implements ChatState {
  status: ChatStatus = 'ready';
  error: Error | undefined = undefined;
  connection: ChatConnection = 'idle';
  readonly queryHash: string;
  private readonly options: ReactQueryChatStateOptions;

  constructor(options: ReactQueryChatStateOptions) {
    this.options = options;
    this.queryHash = hashQueryKey([QueryKeys.messages, options.key]);
  }

  get messages(): TMessage[] {
    const { read, queryClient } = this.options;
    if (read) {
      return read() ?? [];
    }
    return (queryClient.getQueryCache().get(this.queryHash)?.state.data as TMessage[]) ?? [];
  }

  /**
   * How many times the key's data was written. A stream frame can replace a message's content
   * on the same array, so a snapshot keyed by this count still sees that write.
   */
  get version(): number {
    return this.options.queryClient.getQueryCache().get(this.queryHash)?.state.dataUpdateCount ?? 0;
  }

  replaceMessages(messages: TMessage[]): void {
    const { write, queryClient, key } = this.options;
    if (write) {
      write(messages);
      return;
    }
    queryClient.setQueryData<TMessage[]>([QueryKeys.messages, key], messages);
  }

  /**
   * Reports writes to the key's data. The cache notifies synchronously, including from inside
   * another component's render when an observer mounts with initial data, so the listener runs on
   * the next microtask instead.
   */
  subscribe(listener: () => void): () => void {
    let active = true;
    const unsubscribe = this.options.queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== this.queryHash || !dataEvents.has(event.type)) {
        return;
      }
      queueMicrotask(() => {
        if (active) {
          listener();
        }
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }
}
