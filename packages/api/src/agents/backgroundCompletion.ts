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

/** Process-local handle for the durable delivery admitted before launch. */
export interface BackgroundToolWakeupAdmission {
  /** Retires a delivery whose terminal result can no longer be made durable. */
  retire: (reason: string) => Promise<boolean>;
}
