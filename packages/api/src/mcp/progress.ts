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
  runId?: string,
): StreamEvent {
  const data: ToolProgressEvent = {
    toolCallId,
    ...(runId != null && runId !== '' ? { runId } : {}),
    progress: update.progress,
    ...(Number.isFinite(update.total) ? { total: update.total } : {}),
    ...(typeof update.message === 'string' && update.message !== ''
      ? { message: update.message.slice(0, MAX_PROGRESS_MESSAGE_CHARS) }
      : {}),
  };
  return { event: StepEvents.ON_TOOL_PROGRESS, data };
}

/**
 * Per-call emitter for streaming MCP progress to the live tool-call card.
 * Throttles to one event per `minIntervalMs` so a chatty server can't flood
 * the stream; the FIRST terminal notification (`progress >= total`) bypasses
 * the throttle so completion is never dropped, while repeated terminal spam
 * falls back to the normal interval. Emission failures are swallowed —
 * progress is best-effort and must never fail the tool call.
 */
export function createToolProgressEmitter(params: {
  toolCallId: string;
  runId?: string;
  emit: (event: StreamEvent) => void | Promise<void>;
  minIntervalMs?: number;
}): (update: ToolProgressUpdate) => void {
  const minIntervalMs = params.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  let lastEmitAt = Number.NEGATIVE_INFINITY;
  let emittedFinal = false;
  return (update: ToolProgressUpdate): void => {
    /** JSON.parse admits non-finite numbers (`1e999` → Infinity), so guard the
     *  wire values before they reach clients or the throttle arithmetic. */
    if (!Number.isFinite(update.progress)) {
      return;
    }
    const now = Date.now();
    const isFinal =
      Number.isFinite(update.total) && (update.total as number) > 0
        ? update.progress >= (update.total as number)
        : false;
    if (!(isFinal && !emittedFinal) && now - lastEmitAt < minIntervalMs) {
      return;
    }
    if (isFinal) {
      emittedFinal = true;
    }
    lastEmitAt = now;
    try {
      void Promise.resolve(
        params.emit(buildToolProgressEvent(params.toolCallId, update, params.runId)),
      ).catch(() => undefined);
    } catch {
      /* progress is best-effort */
    }
  };
}
