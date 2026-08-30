/** Deadline after which an invocation owner requests cancellation. */
export const BACKGROUND_TASK_TIMEOUT_MS: number = 30 * 60 * 1000;
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
}

export type BackgroundToolDeadClaimRecovery = (
  input: BackgroundToolDeadClaimRecoveryInput,
) => Promise<boolean>;
