import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import type { TConversation, TMessage, TModelSpec, TStartupConfig } from 'librechat-data-provider';
import { Constants, QueryKeys } from 'librechat-data-provider';
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useRecoilValue } from 'recoil';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';

type ContextTrackerProps = {
  conversation: TConversation | null;
};

type MessageWithTokenCount = TMessage & { tokenCount?: number };
type TokenTotals = { inputTokens: number; outputTokens: number; totalUsed: number };

const TRACKER_SIZE = 28;
const TRACKER_STROKE = 3.5;

const formatTokenCount = (count: number): string => {
  const formatted = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
  return formatted.replace(/\.0(?=[A-Za-z]|$)/, '');
};

const getTokenTotals = (messages: TMessage[] | undefined): TokenTotals => {
  if (!messages?.length) {
    return { inputTokens: 0, outputTokens: 0, totalUsed: 0 };
  }

  const totals = messages.reduce(
    (accumulator: Omit<TokenTotals, 'totalUsed'>, message) => {
      const tokenCount = (message as MessageWithTokenCount).tokenCount;
      if (typeof tokenCount !== 'number' || !Number.isFinite(tokenCount) || tokenCount <= 0) {
        return accumulator;
      }

      if (message.isCreatedByUser) {
        accumulator.inputTokens += tokenCount;
      } else {
        accumulator.outputTokens += tokenCount;
      }

      return accumulator;
    },
    { inputTokens: 0, outputTokens: 0 },
  );

  return {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    totalUsed: totals.inputTokens + totals.outputTokens,
  };
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

type ProgressBarProps = {
  value: number;
  max: number;
  colorClass: string;
  label: string;
  showPercentage?: boolean;
  indeterminate?: boolean;
};

function ProgressBar({
  value,
  max,
  colorClass,
  label,
  showPercentage = false,
  indeterminate = false,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary"
      >
        {indeterminate ? (
          <div
            className="h-full w-full rounded-full"
            style={{
              background:
                'repeating-linear-gradient(-45deg, var(--border-medium), var(--border-medium) 4px, var(--surface-tertiary) 4px, var(--surface-tertiary) 8px)',
            }}
          />
        ) : (
          <div className="flex h-full rounded-full">
            <div
              className={cn('rounded-full transition-all duration-300', colorClass)}
              style={{ width: `${percentage}%` }}
            />
            <div className="flex-1 bg-surface-hover" />
          </div>
        )}
      </div>
      {showPercentage && !indeterminate ? (
        <span className="min-w-[3rem] text-right text-xs text-text-secondary" aria-hidden="true">
          {Math.round(percentage)}%
        </span>
      ) : null}
    </div>
  );
}

type TokenRowProps = {
  label: string;
  value: number;
  max: number | null;
  colorClass: string;
  ariaLabel: string;
};

function TokenRow({ label, value, max, colorClass, ariaLabel }: TokenRowProps) {
  const hasMax = max != null && max > 0;
  const percentage = hasMax ? Math.round(Math.min((value / max) * 100, 100)) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="font-medium text-text-primary">
          {formatTokenCount(value)}
          {hasMax ? (
            <span className="ml-1 text-xs text-text-secondary" aria-hidden="true">
              ({percentage}%)
            </span>
          ) : null}
        </span>
      </div>
      <ProgressBar
        value={value}
        max={hasMax ? max : 0}
        colorClass={colorClass}
        label={ariaLabel}
        indeterminate={!hasMax}
      />
    </div>
  );
}

function ContextTracker({ conversation }: ContextTrackerProps) {
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
  const { inputTokens, outputTokens, totalUsed } = useMemo(
    () => getTokenTotals(messages),
    [messages],
  );

  const maxContextTokens =
    typeof conversation?.maxContextTokens === 'number' &&
    Number.isFinite(conversation.maxContextTokens) &&
    conversation.maxContextTokens > 0
      ? conversation.maxContextTokens
      : getSpecMaxContextTokens(startupConfig, conversation?.spec);

  const hasMaxContext = maxContextTokens != null && maxContextTokens > 0;
  const usageRatio = useMemo(() => {
    if (!hasMaxContext || maxContextTokens == null) {
      return 0;
    }

    return Math.min(totalUsed / maxContextTokens, 1);
  }, [hasMaxContext, maxContextTokens, totalUsed]);
  const percentage = Math.round(usageRatio * 100);
  const inputPercentage =
    hasMaxContext && maxContextTokens != null
      ? Math.round(Math.min((inputTokens / maxContextTokens) * 100, 100))
      : 0;
  const outputPercentage =
    hasMaxContext && maxContextTokens != null
      ? Math.round(Math.min((outputTokens / maxContextTokens) * 100, 100))
      : 0;

  const trackerRadius = useMemo(() => (TRACKER_SIZE - TRACKER_STROKE) / 2, []);
  const circumference = useMemo(() => 2 * Math.PI * trackerRadius, [trackerRadius]);
  const dashOffset = useMemo(
    () => circumference - (percentage / 100) * circumference,
    [circumference, percentage],
  );

  const getRingColorClass = () => {
    if (!hasMaxContext) {
      return 'stroke-text-secondary';
    }
    if (percentage > 90) {
      return 'stroke-red-500';
    }
    if (percentage > 75) {
      return 'stroke-yellow-500';
    }
    return 'stroke-green-500';
  };

  const getMainProgressColorClass = () => {
    if (!hasMaxContext) {
      return 'bg-text-secondary';
    }
    if (percentage > 90) {
      return 'bg-red-500';
    }
    if (percentage > 75) {
      return 'bg-yellow-500';
    }
    return 'bg-green-500';
  };

  const ariaLabel = hasMaxContext
    ? localize('com_ui_token_usage_aria_full', {
        0: formatTokenCount(inputTokens),
        1: formatTokenCount(outputTokens),
        2: formatTokenCount(maxContextTokens ?? 0),
        3: percentage.toString(),
      })
    : localize('com_ui_token_usage_aria_no_max', {
        0: formatTokenCount(inputTokens),
        1: formatTokenCount(outputTokens),
        2: formatTokenCount(totalUsed),
      });

  if (!showContextTracker) {
    return null;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          data-testid="context-tracker"
        >
          <svg
            width={TRACKER_SIZE}
            height={TRACKER_SIZE}
            viewBox={`0 0 ${TRACKER_SIZE} ${TRACKER_SIZE}`}
            className="rotate-[-90deg]"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx={TRACKER_SIZE / 2}
              cy={TRACKER_SIZE / 2}
              r={trackerRadius}
              fill="transparent"
              strokeWidth={TRACKER_STROKE}
              className="stroke-border-heavy"
            />
            <circle
              cx={TRACKER_SIZE / 2}
              cy={TRACKER_SIZE / 2}
              r={trackerRadius}
              fill="transparent"
              strokeWidth={TRACKER_STROKE}
              strokeDasharray={circumference}
              strokeDashoffset={hasMaxContext ? dashOffset : circumference}
              strokeLinecap="round"
              className={cn('transition-all duration-300', getRingColorClass())}
            />
          </svg>
        </button>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="top" align="end" className="p-3">
          <div
            className="w-full space-y-3"
            role="region"
            aria-label={localize('com_ui_context_usage')}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {localize('com_ui_context_usage')}
              </span>
              {hasMaxContext ? (
                <span
                  className={cn('text-xs font-medium', {
                    'text-red-500': percentage > 90,
                    'text-yellow-500': percentage > 75 && percentage <= 90,
                    'text-green-500': percentage <= 75,
                  })}
                >
                  {localize('com_ui_token_usage_percent', { 0: percentage.toString() })}
                </span>
              ) : null}
            </div>

            <div className="space-y-1">
              <ProgressBar
                value={totalUsed}
                max={hasMaxContext ? (maxContextTokens ?? 0) : 0}
                colorClass={getMainProgressColorClass()}
                label={
                  hasMaxContext
                    ? localize('com_ui_context_usage_with_max', {
                        0: `${percentage}%`,
                        1: formatTokenCount(totalUsed),
                        2: formatTokenCount(maxContextTokens ?? 0),
                      })
                    : localize('com_ui_context_usage_unknown_max', {
                        0: formatTokenCount(totalUsed),
                      })
                }
                indeterminate={!hasMaxContext}
              />
              <div className="flex justify-between text-xs text-text-secondary" aria-hidden="true">
                <span>{formatTokenCount(totalUsed)}</span>
                <span>{hasMaxContext ? formatTokenCount(maxContextTokens ?? 0) : '--'}</span>
              </div>
            </div>

            <div className="border-t border-border-light" role="separator" />

            <div className="space-y-3">
              <TokenRow
                label={localize('com_ui_token_usage_input')}
                value={inputTokens}
                max={maxContextTokens}
                colorClass="bg-blue-500"
                ariaLabel={localize('com_ui_token_usage_input_aria', {
                  0: formatTokenCount(inputTokens),
                  1: formatTokenCount(maxContextTokens ?? 0),
                  2: inputPercentage.toString(),
                })}
              />
              <TokenRow
                label={localize('com_ui_token_usage_output')}
                value={outputTokens}
                max={maxContextTokens}
                colorClass="bg-green-500"
                ariaLabel={localize('com_ui_token_usage_output_aria', {
                  0: formatTokenCount(outputTokens),
                  1: formatTokenCount(maxContextTokens ?? 0),
                  2: outputPercentage.toString(),
                })}
              />
            </div>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}

export default memo(ContextTracker);
