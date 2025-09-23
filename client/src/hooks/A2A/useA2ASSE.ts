// A2A SSE helpers: keep A2A-specific parsing/logging out of the generic useSSE hook.

export function extractMetaFromFinal(data: any): {
    endpoint?: string;
    taskId?: string;
    agentId?: string;
    conversationId?: string;
  } {
    try {
      const endpoint = data?.responseMessage?.endpoint as string | undefined;
      const taskId = data?.responseMessage?.metadata?.taskId as string | undefined;
      const agentId = data?.responseMessage?.metadata?.agentId as string | undefined;
      const conversationId = data?.conversation?.conversationId as string | undefined;
      return { endpoint, taskId, agentId, conversationId };
    } catch (_e) {
      return {};
    }
  }
  
  // Debug helper to log created events with minimal noise.
  export function logA2ACreated(
    data: any,
    getMessages: () => Array<{ messageId: string; parentMessageId?: string | null; conversationId?: string | null }> | undefined,
  ) {
    try {
      const msg = data?.message ?? {};
      const current = getMessages?.() ?? [];
      const last = current.length ? current[current.length - 1] : null;
      // Keep logs compact and consistent for troubleshooting forks
      // eslint-disable-next-line no-console
      console.log('[A2A][SSE] created event', {
        incoming: {
          messageId: msg?.messageId,
          parentMessageId: msg?.parentMessageId,
          conversationId: msg?.conversationId,
        },
        currentLast: last
          ? {
              messageId: last.messageId,
              parentMessageId: last.parentMessageId,
              conversationId: last.conversationId,
            }
          : null,
      });
    } catch (_e) {
      // no-op
    }
  }
  
  // Debug helper to log final events with request/response linkage for A2A tasks.
  export function logA2AFinal(data: any) {
    try {
      const rm = data?.responseMessage ?? {};
      const reqm = data?.requestMessage ?? {};
      // eslint-disable-next-line no-console
      console.log('[A2A][SSE] final event', {
        endpoint: rm?.endpoint,
        request: {
          messageId: reqm?.messageId,
          parentMessageId: reqm?.parentMessageId,
          conversationId: reqm?.conversationId,
        },
        response: {
          messageId: rm?.messageId,
          parentMessageId: rm?.parentMessageId,
          conversationId: rm?.conversationId,
          metadata: rm?.metadata,
        },
        convo: data?.conversation?.conversationId,
      });
    } catch (_e) {
      // no-op
    }
  }
  
  
  