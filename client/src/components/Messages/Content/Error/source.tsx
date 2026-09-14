import { createContext, useContext, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useMessageContext } from '~/Providers/MessageContext';

/** The fields of a message that say who produced a failure and when. */
export type ErrorSource = Pick<TMessage, 'endpoint' | 'model' | 'createdAt'> & {
  /** The agent a handoff earlier in the row made active for the failing part. */
  handoffAgentId?: string;
};

/** A position in a row's content where an `AGENT_UPDATE` handed the run to another agent. */
type Handoff = { index: number; agentId: string };

type RowSource = { source: ErrorSource; handoffs: Handoff[] };

const ErrorSourceContext = createContext<RowSource | undefined>(undefined);

function findHandoffs(content: TMessage['content']): Handoff[] {
  const handoffs: Handoff[] = [];
  for (let index = 0; index < (content?.length ?? 0); index++) {
    const part = content?.[index];
    if (part?.type !== ContentTypes.AGENT_UPDATE) {
      continue;
    }
    const agentId = part[ContentTypes.AGENT_UPDATE]?.agentId;
    if (agentId) {
      handoffs.push({ index, agentId });
    }
  }
  return handoffs;
}

/** The agent active at `partIndex`: whichever handoff last precedes it. */
function findActiveAgent(handoffs: Handoff[], partIndex: number): string | undefined {
  let agentId: string | undefined;
  for (const handoff of handoffs) {
    if (handoff.index >= partIndex) {
      break;
    }
    agentId = handoff.agentId;
  }
  return agentId;
}

/**
 * Supplies a message row's identity to the errors rendered inside it.
 *
 * A failure during a run is persisted as an error content part, and `Part` renders it without the
 * message it belongs to. Without this, its copy could only name the conversation's current
 * endpoint and model, which stop being the ones that failed as soon as the reader switches models.
 *
 * A sequential agent run hands off mid-row through `AGENT_UPDATE` parts, so the row also records
 * where each handoff sits, and an error part resolves the agent active at its own position (the
 * absolute `partIndex` its `MessageContext` carries). The handoffs are keyed by value: a streaming
 * row, whose content changes on every token, keeps one context value until a handoff is actually
 * added, so its error parts do not re-render in between.
 */
export function ErrorSourceProvider({
  message,
  children,
}: {
  message: Pick<TMessage, 'endpoint' | 'model' | 'createdAt' | 'content'>;
  children: ReactNode;
}) {
  const { endpoint, model, createdAt, content } = message;
  const handoffKey = useMemo(() => JSON.stringify(findHandoffs(content)), [content]);
  const row = useMemo<RowSource>(
    () => ({
      source: { endpoint, model, createdAt },
      handoffs: JSON.parse(handoffKey) as Handoff[],
    }),
    [endpoint, model, createdAt, handoffKey],
  );
  return <ErrorSourceContext.Provider value={row}>{children}</ErrorSourceContext.Provider>;
}

/** The identity of the row rendering this error, resolved to the agent active at its position. */
export function useErrorSource(): ErrorSource | undefined {
  const row = useContext(ErrorSourceContext);
  const { partIndex } = useMessageContext();
  return useMemo(() => {
    if (row == null) {
      return undefined;
    }
    const handoffAgentId = partIndex == null ? undefined : findActiveAgent(row.handoffs, partIndex);
    return handoffAgentId == null ? row.source : { ...row.source, handoffAgentId };
  }, [row, partIndex]);
}
