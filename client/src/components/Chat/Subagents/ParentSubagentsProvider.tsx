import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ParentSubagentIndex, ParentSubagentSummary } from 'librechat-data-provider';
import { useParentSubagentsQuery } from '~/data-provider';

type ParentSubagentsContextValue = {
  byMessageId: ReadonlyMap<string, ParentSubagentSummary[]>;
  byThreadId: ReadonlyMap<string, ParentSubagentSummary>;
  refresh: () => Promise<ParentSubagentIndex | undefined>;
};

const emptyMap = new Map<string, ParentSubagentSummary[]>();
const emptyThreadMap = new Map<string, ParentSubagentSummary>();
const defaultValue: ParentSubagentsContextValue = {
  byMessageId: emptyMap,
  byThreadId: emptyThreadMap,
  refresh: async () => undefined,
};

const ParentSubagentsContext = createContext<ParentSubagentsContextValue>(defaultValue);

export function ParentSubagentsProvider({
  conversationId,
  enabled,
  children,
}: {
  conversationId: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { data, refetch } = useParentSubagentsQuery(conversationId, { enabled });
  const refresh = useCallback(async () => {
    const result = await refetch();
    return result.data;
  }, [refetch]);
  const value = useMemo<ParentSubagentsContextValue>(() => {
    const byMessageId = new Map<string, ParentSubagentSummary[]>();
    const byThreadId = new Map<string, ParentSubagentSummary>();
    for (const child of data?.children ?? []) {
      byThreadId.set(child.threadId, child);
      if (child.origin !== 'event') continue;
      const siblings = byMessageId.get(child.parentMessageId) ?? [];
      siblings.push(child);
      byMessageId.set(child.parentMessageId, siblings);
    }
    for (const siblings of byMessageId.values()) {
      siblings.sort((left, right) => {
        const updated = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
        return updated === 0 ? left.threadId.localeCompare(right.threadId) : updated;
      });
    }
    return { byMessageId, byThreadId, refresh };
  }, [data, refresh]);

  return (
    <ParentSubagentsContext.Provider value={value}>{children}</ParentSubagentsContext.Provider>
  );
}

export const useParentSubagents = () => useContext(ParentSubagentsContext);
