/** Deadline after which an invocation owner requests cancellation. */
export const BACKGROUND_TASK_TIMEOUT_MS: number = 30 * 60 * 1000;
/** Gives a cooperative tool a short window to settle after cancellation before
 * its automatic completion delivery is retired. */
export const BACKGROUND_TASK_ABORT_GRACE_MS: number = 60 * 1000;
/** Three missed heartbeats prove the process-local executor has been lost. */
export const BACKGROUND_TOOL_PRODUCER_LEASE_MS: number = 30_000;
export const BACKGROUND_TOOL_PRODUCER_HEARTBEAT_MS: number = 10_000;

/** Host-owned identity recorded before ordinary background tool work begins. */
export interface BackgroundToolWakeupRegistration {
  taskId: string;
  toolCallId: string;
  toolName: string;
  userId: string;
  tenantId?: string;
  conversationId: string;
  parentMessageId: string;
  parentAgentId?: string;
  createdAt: number;
}

export interface BackgroundToolWakeupRetireOptions {
  /** Retire only before a resolver owns the delivery. */
  onlyIfUnclaimed?: boolean;
  /** Reconcile only after the delivery is irreversibly dead-lettered. */
  onlyIfDead?: boolean;
}

/** Process-local handle for the durable delivery admitted before launch. */
export interface BackgroundToolWakeupAdmission {
  /** Renews durable proof that the process-local executor still owns work. */
  renew: () => Promise<boolean>;
  /** Persists terminal output on the pre-admitted delivery before the parent
   * message projection exists. */
  persistResult?: (result: {
    status: 'completed' | 'error' | 'cancelled';
    output: string;
    settledAt: Date;
  }) => Promise<boolean>;
  /** Retires a delivery whose terminal result can no longer be made durable.
   * Manual polling requires an atomic unclaimed-only transition: once a
   * resolver owns a lease, its prepared continuation cannot be cancelled. */
  retire: (reason: string, options?: BackgroundToolWakeupRetireOptions) => Promise<boolean>;
}

/** Durable ownership repair used by a manual poll after an automatic
 * continuation delivery has irreversibly dead-lettered. `claimId` names the
 * batch-root delivery that owns every claimed sibling, not necessarily the
 * polled task's own pre-admitted delivery. */
export interface BackgroundToolDeadClaimRecoveryInput {
  userId: string;
  conversationId: string;
  messageId: string;
  claimId: string;
  /** Omitted for the legacy automatic-wakeup recovery path. */
  kind?: 'manual' | 'wakeup';
  /** Required to prove that a manual claim's owning generation is no longer active. */
  generationId?: string;
}

export type BackgroundToolDeadClaimRecovery = (
  input: BackgroundToolDeadClaimRecoveryInput,
) => Promise<boolean>;

/** A background tool completion whose result has not reached its conversation yet,
 * read from the durable delivery store rather than a process-local registry. */
export interface PendingBackgroundCompletion {
  taskId: string;
  toolName: string;
  dispatchedAt: Date;
  /** The tool's terminal outcome once it settled; absent while it still runs. */
  result?: { status: 'completed' | 'error' | 'cancelled'; settledAt: Date };
  /** An automatic delivery holds the result and is starting its turn. */
  claimedByWakeup: boolean;
}

/**
 * What cancelling an undelivered completion did: `discarded` retired its delivery,
 * so the result never arrives; `running` found the tool still executing where this
 * process cannot stop it; `delivering` found the result already being delivered;
 * `not_pending` found no undelivered completion for the task.
 */
export type BackgroundCompletionDiscardOutcome =
  | 'discarded'
  | 'running'
  | 'delivering'
  | 'not_pending';

/** Durable view and control of one principal's undelivered background completions. */
export interface PendingBackgroundCompletionControls {
  list: (input: {
    userId: string;
    conversationId: string;
  }) => Promise<PendingBackgroundCompletion[]>;
  discard: (input: {
    userId: string;
    conversationId: string;
    taskId: string;
  }) => Promise<BackgroundCompletionDiscardOutcome>;
}
