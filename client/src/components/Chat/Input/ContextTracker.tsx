import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TConversation, TMessage, TModelSpec, TStartupConfig } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import { TooltipAnchor } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type ContextTrackerProps = {
  conversation: TConversation | null;
};

type MessageWithTokenCount = TMessage & { tokenCount?: number };

const TRACKER_SIZE = 24;
const TRACKER_STROKE = 2.5;

const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
};

const getUsedTokens = (messages: TMessage[] | undefined): number => {
  if (!messages?.length) {
    return 0;
  }

  return messages.reduce((totalTokens, message) => {
    const tokenCount = (message as MessageWithTokenCount).tokenCount;
    if (typeof tokenCount !== 'number' || !Number.isFinite(tokenCount) || tokenCount <= 0) {
      return totalTokens;
    }

    return totalTokens + tokenCount;
  }, 0);
};

const getSpecMaxContextTokens = (
  startupConfig: TStartupConfig | undefined,
  specName: string | null | undefined,
): number | null => {
  if (!specName) {
    return null;
  }

  const modelSpec = startupConfig?.modelSpecs?.list?.find(
    (spec: TModelSpec) => spec.name === specName,
  );
  const maxContextTokens = modelSpec?.preset?.maxContextTokens;
  if (
    typeof maxContextTokens !== 'number' ||
    !Number.isFinite(maxContextTokens) ||
    maxContextTokens <= 0
  ) {
    return null;
  }

  return maxContextTokens;
};

export default function ContextTracker({ conversation }: ContextTrackerProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const showContextTracker = useRecoilValue(store.showContextTracker);
  const conversationId = conversation?.conversationId ?? Constants.NEW_CONVO;
  const subscribeToMessages = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const queryKey = event?.query?.queryKey;
        if (!Array.isArray(queryKey) || queryKey[0] !== QueryKeys.messages) {
          return;
        }
        if (queryKey[1] !== conversationId) {
          return;
        }
        onStoreChange();
      }),
    [conversationId, queryClient],
  );

  const getMessagesSnapshot = useCallback(
    () => queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]),
    [conversationId, queryClient],
  );

  const messages = useSyncExternalStore(
    subscribeToMessages,
    getMessagesSnapshot,
    getMessagesSnapshot,
  );
  const usedTokens = useMemo(() => getUsedTokens(messages), [messages]);

  const maxContextTokens =
    typeof conversation?.maxContextTokens === 'number' &&
    Number.isFinite(conversation.maxContextTokens) &&
    conversation.maxContextTokens > 0
      ? conversation.maxContextTokens
      : getSpecMaxContextTokens(startupConfig, conversation?.spec);

  const usageRatio = useMemo(() => {
    if (maxContextTokens == null || maxContextTokens <= 0) {
      return 0;
    }

    return Math.min(usedTokens / maxContextTokens, 1);
  }, [maxContextTokens, usedTokens]);

  const trackerRadius = useMemo(() => (TRACKER_SIZE - TRACKER_STROKE) / 2, []);
  const circumference = useMemo(() => 2 * Math.PI * trackerRadius, [trackerRadius]);
  const dashOffset = useMemo(() => circumference * (1 - usageRatio), [circumference, usageRatio]);

  let ringColorClass = 'text-text-primary';
  if (maxContextTokens == null) {
    ringColorClass = 'text-text-secondary';
  } else if (usageRatio > 0.9) {
    ringColorClass = 'text-red-500';
  } else if (usageRatio > 0.75) {
    ringColorClass = 'text-yellow-500';
  }

  const tooltipDescription = useMemo(() => {
    if (maxContextTokens == null) {
      return localize('com_ui_context_usage_unknown_max', {
        0: formatTokenCount(usedTokens),
      });
    }

    const percentage = (usageRatio * 100).toFixed(1) + '%';
    return localize('com_ui_context_usage_with_max', {
      0: percentage,
      1: formatTokenCount(usedTokens),
      2: formatTokenCount(maxContextTokens),
    });
  }, [localize, maxContextTokens, usedTokens, usageRatio]);

  if (!showContextTracker) {
    return null;
  }

  return (
    <TooltipAnchor
      description={tooltipDescription}
      side="top"
      render={
        <button
          type="button"
          aria-label={localize('com_ui_context_usage')}
          className={cn('rounded-full p-1.5', ringColorClass)}
          data-testid="context-tracker"
        >
          <svg
            width={TRACKER_SIZE}
            height={TRACKER_SIZE}
            viewBox={`0 0 ${TRACKER_SIZE} ${TRACKER_SIZE}`}
          >
            <circle
              cx={TRACKER_SIZE / 2}
              cy={TRACKER_SIZE / 2}
              r={trackerRadius}
              stroke="currentColor"
              strokeWidth={TRACKER_STROKE}
              fill="transparent"
              className="opacity-20"
            />
            <circle
              cx={TRACKER_SIZE / 2}
              cy={TRACKER_SIZE / 2}
              r={trackerRadius}
              stroke="currentColor"
              strokeWidth={TRACKER_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashOffset}
              fill="transparent"
              transform={`rotate(-90 ${TRACKER_SIZE / 2} ${TRACKER_SIZE / 2})`}
              className="transition-all duration-200"
            />
          </svg>
        </button>
      }
    />
  );
}
