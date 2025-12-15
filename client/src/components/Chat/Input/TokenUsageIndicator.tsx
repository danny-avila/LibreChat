import { memo } from 'react';
import { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal } from '@librechat/client';
import { useLocalize, useTokenUsage } from '~/hooks';
import { cn } from '~/utils';

function formatTokens(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return n.toString();
}

interface ProgressBarProps {
  value: number;
  max: number;
  colorClass: string;
  label: string;
  showPercentage?: boolean;
}

function ProgressBar({ value, max, colorClass, label, showPercentage = false }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary"
      >
        <div className="flex h-full rounded-full">
          <div
            className={cn('rounded-full transition-all duration-300', colorClass)}
            style={{ width: `${percentage}%` }}
          />
          <div className="flex-1 bg-surface-hover" />
        </div>
      </div>
      {showPercentage && (
        <span className="min-w-[3rem] text-right text-xs text-text-secondary" aria-hidden="true">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}

interface TokenRowProps {
  label: string;
  value: number;
  total: number;
  colorClass: string;
  ariaLabel: string;
}

function TokenRow({ label, value, total, colorClass, ariaLabel }: TokenRowProps) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="font-medium text-text-primary">
          {formatTokens(value)}
          <span className="ml-1 text-xs text-text-secondary" aria-hidden="true">
            ({percentage}%)
          </span>
        </span>
      </div>
      <ProgressBar value={value} max={total} colorClass={colorClass} label={ariaLabel} />
    </div>
  );
}

function TokenUsageContent() {
  const localize = useLocalize();
  const { inputTokens, outputTokens, maxContext } = useTokenUsage();

  const totalUsed = inputTokens + outputTokens;
  const hasMaxContext = maxContext !== null && maxContext > 0;
  const percentage = hasMaxContext ? Math.min((totalUsed / maxContext) * 100, 100) : 0;

  const getMainProgressColor = () => {
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

  const inputPercentage = totalUsed > 0 ? Math.round((inputTokens / totalUsed) * 100) : 0;
  const outputPercentage = totalUsed > 0 ? Math.round((outputTokens / totalUsed) * 100) : 0;

  return (
    <div
      className="w-full space-y-3"
      role="region"
      aria-label={localize('com_ui_token_usage_context')}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary" id="token-usage-title">
          {localize('com_ui_token_usage_context')}
        </span>
        {hasMaxContext && (
          <span
            className={cn('text-xs font-medium', {
              'text-red-500': percentage > 90,
              'text-yellow-500': percentage > 75 && percentage <= 90,
              'text-green-500': percentage <= 75,
            })}
          >
            {localize('com_ui_token_usage_percent', { 0: Math.round(percentage).toString() })}
          </span>
        )}
      </div>

      {/* Main Progress Bar */}
      {hasMaxContext && (
        <div className="space-y-1">
          <ProgressBar
            value={totalUsed}
            max={maxContext}
            colorClass={getMainProgressColor()}
            label={`${localize('com_ui_token_usage_context')}: ${formatTokens(totalUsed)} of ${formatTokens(maxContext)}, ${Math.round(percentage)}%`}
          />
          <div className="flex justify-between text-xs text-text-secondary" aria-hidden="true">
            <span>{formatTokens(totalUsed)}</span>
            <span>{formatTokens(maxContext)}</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border-light" role="separator" />

      {/* Input/Output Breakdown */}
      <div className="space-y-3">
        <TokenRow
          label={localize('com_ui_token_usage_input')}
          value={inputTokens}
          total={totalUsed}
          colorClass="bg-blue-500"
          ariaLabel={`${localize('com_ui_token_usage_input')}: ${formatTokens(inputTokens)}, ${inputPercentage}% of total`}
        />
        <TokenRow
          label={localize('com_ui_token_usage_output')}
          value={outputTokens}
          total={totalUsed}
          colorClass="bg-green-500"
          ariaLabel={`${localize('com_ui_token_usage_output')}: ${formatTokens(outputTokens)}, ${outputPercentage}% of total`}
        />
      </div>
    </div>
  );
}

const TokenUsageIndicator = memo(function TokenUsageIndicator() {
  const localize = useLocalize();
  const { inputTokens, outputTokens, maxContext } = useTokenUsage();

  const totalUsed = inputTokens + outputTokens;
  const hasMaxContext = maxContext !== null && maxContext > 0;
  const percentage = hasMaxContext ? Math.min((totalUsed / maxContext) * 100, 100) : 0;

  // Ring calculations
  const size = 28;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const ariaLabel = hasMaxContext
    ? localize('com_ui_token_usage_aria_full', {
        0: formatTokens(inputTokens),
        1: formatTokens(outputTokens),
        2: formatTokens(maxContext),
        3: Math.round(percentage).toString(),
      })
    : localize('com_ui_token_usage_aria_no_max', {
        0: formatTokens(inputTokens),
        1: formatTokens(outputTokens),
      });

  // Color based on percentage
  const getProgressColor = () => {
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

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="rotate-[-90deg]"
            aria-hidden="true"
            focusable="false"
          >
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              strokeWidth={strokeWidth}
              className="stroke-border-heavy"
            />
            {/* Progress ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={hasMaxContext ? offset : circumference}
              strokeLinecap="round"
              className={cn('transition-all duration-300', getProgressColor())}
            />
          </svg>
        </button>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          side="top"
          align="end"
          className="p-3"
          role="dialog"
          aria-label={localize('com_ui_token_usage_context')}
        >
          <TokenUsageContent />
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
});

export default TokenUsageIndicator;
