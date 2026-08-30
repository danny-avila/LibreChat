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
