export type SubagentThreadStatus =
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export type SubagentThreadMessage = {
  messageId: string;
  parentMessageId: string | null;
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string;
  error?: boolean;
  textTruncated?: boolean;
};

export type SubagentThreadView = {
  threadId: string;
  parentConversationId: string;
  parentMessageId: string;
  parentToolCallId: string;
  subagentType: string;
  subagentKind: 'agent' | 'graph';
  agentId?: string;
  title: string;
  status: SubagentThreadStatus;
  messages: SubagentThreadMessage[];
  historyTruncated: boolean;
  updatedAt?: string;
};
