import { memo } from 'react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize, useTokenUsage } from '~/hooks';
import { cn } from '~/utils';

function formatTokens(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}

const TokenUsageIndicator = memo(function TokenUsageIndicator() {
  const localize = useLocalize();
  const { inputTokens, outputTokens, maxContext } = useTokenUsage();

  const totalUsed = inputTokens + outputTokens;
  const hasMaxContext = maxContext !== null && maxContext > 0;
  const percentage = hasMaxContext ? Math.min((totalUsed / maxContext) * 100, 100) : 0;

  // Ring calculations
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const tooltipText = hasMaxContext
    ? localize('com_ui_token_usage_with_max', {
        0: formatTokens(inputTokens),
        1: formatTokens(outputTokens),
        2: formatTokens(maxContext),
      })
    : localize('com_ui_token_usage_no_max', {
        0: formatTokens(inputTokens),
        1: formatTokens(outputTokens),
      });

  const ariaLabel = hasMaxContext
    ? localize('com_ui_token_usage_aria', { 0: Math.round(percentage).toString() })
    : localize('com_ui_token_usage_indicator');

  // Color based on percentage (using raw colors to match existing patterns in AudioRecorder.tsx)
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
    <TooltipAnchor
      description={tooltipText}
      render={
        <div
          className="flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover"
          role="img"
          aria-label={ariaLabel}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="rotate-[-90deg]"
            aria-hidden="true"
          >
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              strokeWidth={strokeWidth}
              className="stroke-border-medium"
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
        </div>
      }
    />
  );
});

export default TokenUsageIndicator;
