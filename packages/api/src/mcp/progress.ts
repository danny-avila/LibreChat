import { StepEvents } from 'librechat-data-provider';
import type { ToolProgressEvent } from 'librechat-data-provider';
import type { StreamEvent } from '~/types';

/** Params forwarded from MCP `notifications/progress` by the SDK's `onprogress`. */
export interface ToolProgressUpdate {
  progress: number;
  total?: number;
  message?: string;
}

const MAX_PROGRESS_MESSAGE_CHARS = 500;
const DEFAULT_MIN_INTERVAL_MS = 200;

export function buildToolProgressEvent(
  toolCallId: string,
  update: ToolProgressUpdate,
): StreamEvent {
  const data: ToolProgressEvent = {
    toolCallId,
    progress: update.progress,
    ...(update.total != null ? { total: update.total } : {}),
    ...(typeof update.message === 'string' && update.message !== ''
      ? { message: update.message.slice(0, MAX_PROGRESS_MESSAGE_CHARS) }
      : {}),
  };
  return { event: StepEvents.ON_TOOL_PROGRESS, data };
}

/**
 * Per-call emitter for streaming MCP progress to the live tool-call card.
 * Throttles to one event per `minIntervalMs` so a chatty server can't flood
 * the stream; the terminal notification (`progress >= total`) always passes.
 * Emission failures are swallowed — progress is best-effort and must never
 * fail the tool call.
 */
export function createToolProgressEmitter(params: {
  toolCallId: string;
  emit: (event: StreamEvent) => void | Promise<void>;
  minIntervalMs?: number;
}): (update: ToolProgressUpdate) => void {
  const minIntervalMs = params.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  let lastEmitAt = Number.NEGATIVE_INFINITY;
  return (update: ToolProgressUpdate): void => {
    const now = Date.now();
    const isFinal = update.total != null && update.total > 0 && update.progress >= update.total;
    if (!isFinal && now - lastEmitAt < minIntervalMs) {
      return;
    }
    lastEmitAt = now;
    try {
      void Promise.resolve(params.emit(buildToolProgressEvent(params.toolCallId, update))).catch(
        () => undefined,
      );
    } catch {
      /* progress is best-effort */
    }
  };
}
