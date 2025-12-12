import { EventEmitter } from 'events';
import { logger } from '@librechat/data-schemas';
import type { IEventTransport } from '../interfaces/IJobStore';

interface StreamState {
  emitter: EventEmitter;
  allSubscribersLeftCallback?: () => void;
}

/**
 * In-memory event transport using Node.js EventEmitter.
 * For horizontal scaling, replace with RedisEventTransport.
 */
export class InMemoryEventTransport implements IEventTransport {
  private streams = new Map<string, StreamState>();

  private getOrCreateStream(streamId: string): StreamState {
    let state = this.streams.get(streamId);
    if (!state) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      state = { emitter };
      this.streams.set(streamId, state);
    }
    return state;
  }

  subscribe(
    streamId: string,
    handlers: {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    },
  ): { unsubscribe: () => void } {
    const state = this.getOrCreateStream(streamId);

    const chunkHandler = (event: unknown) => handlers.onChunk(event);
    const doneHandler = (event: unknown) => handlers.onDone?.(event);
    const errorHandler = (error: string) => handlers.onError?.(error);

    state.emitter.on('chunk', chunkHandler);
    state.emitter.on('done', doneHandler);
    state.emitter.on('error', errorHandler);

    return {
      unsubscribe: () => {
        const currentState = this.streams.get(streamId);
        if (currentState) {
          currentState.emitter.off('chunk', chunkHandler);
          currentState.emitter.off('done', doneHandler);
          currentState.emitter.off('error', errorHandler);

          // Check if all subscribers left
          if (currentState.emitter.listenerCount('chunk') === 0) {
            currentState.allSubscribersLeftCallback?.();
          }
        }
      },
    };
  }

  emitChunk(streamId: string, event: unknown): void {
    const state = this.streams.get(streamId);
    state?.emitter.emit('chunk', event);
  }

  emitDone(streamId: string, event: unknown): void {
    const state = this.streams.get(streamId);
    state?.emitter.emit('done', event);
  }

  emitError(streamId: string, error: string): void {
    const state = this.streams.get(streamId);
    state?.emitter.emit('error', error);
  }

  getSubscriberCount(streamId: string): number {
    const state = this.streams.get(streamId);
    return state?.emitter.listenerCount('chunk') ?? 0;
  }

  onAllSubscribersLeft(streamId: string, callback: () => void): void {
    const state = this.getOrCreateStream(streamId);
    state.allSubscribersLeftCallback = callback;
  }

  /**
   * Check if this is the first subscriber (for ready signaling)
   */
  isFirstSubscriber(streamId: string): boolean {
    const state = this.streams.get(streamId);
    return state?.emitter.listenerCount('chunk') === 1;
  }

  /**
   * Cleanup a stream's event emitter
   */
  cleanup(streamId: string): void {
    const state = this.streams.get(streamId);
    if (state) {
      state.emitter.removeAllListeners();
      this.streams.delete(streamId);
    }
  }

  /**
   * Get count of tracked streams (for monitoring)
   */
  getStreamCount(): number {
    return this.streams.size;
  }

  destroy(): void {
    for (const state of this.streams.values()) {
      state.emitter.removeAllListeners();
    }
    this.streams.clear();
    logger.debug('[InMemoryEventTransport] Destroyed');
  }
}
