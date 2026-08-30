/** Deadline after which an invocation owner requests cancellation. */
export const BACKGROUND_TASK_TIMEOUT_MS: number = 30 * 60 * 1000;

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
  /** Retires a delivery whose terminal result can no longer be made durable.
   * Manual polling requires an atomic unclaimed-only transition: once a
   * resolver owns a lease, its prepared continuation cannot be cancelled. */
  retire: (reason: string, options?: BackgroundToolWakeupRetireOptions) => Promise<boolean>;
}
