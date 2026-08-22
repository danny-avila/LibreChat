export type SubagentThreadStatus =
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

/**
 * A bounded, presentation-safe description of child work. This deliberately
 * models user-visible activity instead of the LangChain messages, SSE events,
 * or durable records that produced it.
 */
export type SubagentActivityItem =
  | {
      type: 'writing';
      text: string;
      textTruncated?: boolean;
    }
  | {
      type: 'reasoning';
    }
  | {
      type: 'tool';
      toolCallId: string;
      name: string;
      input?: string;
      output?: string;
      status: 'running' | 'completed' | 'failed' | 'cancelled';
      inputTruncated?: boolean;
      outputTruncated?: boolean;
    };

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
  /** Activity for the exact task requested by the parent card, when retained. */
  activity: SubagentActivityItem[];
  activityTruncated: boolean;
  messages: SubagentThreadMessage[];
  historyTruncated: boolean;
  updatedAt?: string;
};
