export type SubagentThreadStatus =
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export type ParentSubagentTaskSummary = {
  taskId: string;
  status: SubagentThreadStatus;
  createdAt?: string;
};

/**
 * Bounded discovery projection for one child owned by a parent conversation.
 * Event-delivery identities stay private; `actorId` is the only event-binding
 * field intentionally exposed to the parent's UI.
 */
export type ParentSubagentSummary = {
  threadId: string;
  parentMessageId: string;
  /** Present only for ordinary tool-spawned children. */
  parentToolCallId?: string;
  subagentType: string;
  subagentKind: 'agent' | 'graph';
  agentId?: string;
  title: string;
  origin: 'tool' | 'event';
  actorId?: string;
  status: SubagentThreadStatus;
  updatedAt?: string;
  latestTaskId?: string;
  tasks: ParentSubagentTaskSummary[];
  tasksTruncated: boolean;
};

export type ParentSubagentIndex = {
  parentConversationId: string;
  children: ParentSubagentSummary[];
  childrenTruncated: boolean;
};

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

export type SubagentControlAction = 'steer' | 'queue' | 'interrupt' | 'cancel' | 'cancel_message';

export type SubagentControlReceipt = {
  invocationId: string;
  controlId?: string;
  action: SubagentControlAction;
  status: 'accepted' | 'applied' | 'rejected' | 'failed';
  createdAt: string;
  updatedAt: string;
  boundary?: 'preempt' | 'tool' | 'turn';
  reason?: string;
  message?: string;
  messageTruncated?: boolean;
};

export type SubagentControlRequest = {
  taskId: string;
  invocationId: string;
  action: SubagentControlAction;
  message?: string;
  controlId?: string;
};

export type SubagentControlResponse = {
  receipt: SubagentControlReceipt;
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
  /** Bounded authoritative parent-to-child command receipts for this task. */
  controlReceipts?: SubagentControlReceipt[];
  /** True when older authoritative command receipts were omitted from this view. */
  controlReceiptsTruncated?: boolean;
  messages: SubagentThreadMessage[];
  historyTruncated: boolean;
  updatedAt?: string;
};
