import type { Agents, TPendingSteer } from 'librechat-data-provider';

/** Where a resumable run reports what it is doing. The app passes its own logger. */
export interface ResumableLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Whether the page is in the foreground, and a way to hear when that changes. */
export interface PageVisibility {
  isVisible: () => boolean;
  /** Calls `listener` on every visibility change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
}

/** The document's own visibility. */
export const documentVisibility: PageVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/** The status route's answer for a conversation's generation. */
export interface StreamStatusResponse {
  /** Exact protocol selected by the job. Missing/1 is always legacy. */
  generationProtocolVersion?: number;
  active: boolean;
  /** Client-local cache marker used to force useResumeOnLoad to replace a
   * stale generation attachment with the newer epoch occupying this stream. */
  generationHandoff?: boolean;
  streamId?: string;
  status?: 'running' | 'complete' | 'error' | 'aborted' | 'requires_action';
  aggregatedContent?: Array<{ type: string; text?: string }>;
  createdAt?: number;
  /** Generation age computed on the server's clock, so a reattaching client
   *  can rebuild a clock-local elapsed baseline free of cross-machine skew. */
  elapsedMs?: number;
  resumeState?: Agents.ResumeState;
  /** The run's temporary state as the server recorded it at admission, so a rebuilt
   *  submission keeps a hidden chat out of history and titling after a reload. */
  isTemporary?: boolean;
  /** Live pending approval when `status === 'requires_action'`; mirrors
   *  `resumeState.pendingAction`, surfaced top-level for the resume-on-load path. */
  pendingAction?: Agents.PendingAction;
  /** Acknowledged steers a terminal drain parked because no subscriber was
   *  live for the final/abort event. Reads are replayable until an exact
   *  recovery turn persists or the user discards the item. */
  unrecoveredSteers?: TPendingSteer[];
}

/** Reads a conversation's generation status. */
export type FetchStreamStatus = (conversationId: string) => Promise<StreamStatusResponse>;
