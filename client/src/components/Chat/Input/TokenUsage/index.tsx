import { memo } from 'react';
import { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import useTokenUsage from '~/hooks/Chat/useTokenUsage';
import { useGetStartupConfig } from '~/data-provider';
import { formatTokens } from '~/utils';
import { useLocalize } from '~/hooks';
import Breakdown from './Breakdown';
import Gauge from './Gauge';

interface TokenUsageProps {
  index: number;
  conversation: TConversation | null;
  isSubmitting: boolean;
}

function TokenUsageIndicator({
  index,
  conversation,
  isSubmitting,
  showCost,
}: TokenUsageProps & {
  showCost: boolean;
}) {
  const localize = useLocalize();
  const view = useTokenUsage({ index, conversation, isSubmitting });

  if (view.usedTokens <= 0 && view.maxTokens == null) {
    return null;
  }

  const hasMax = view.maxTokens != null && view.maxTokens > 0;
  const ariaLabel = hasMax
    ? localize('com_ui_context_usage_label', {
        0: formatTokens(view.usedTokens),
        1: formatTokens(view.maxTokens ?? 0),
        2: String(Math.round(view.percent)),
      })
    : localize('com_ui_context_usage_label_unknown', { 0: formatTokens(view.usedTokens) });

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="token-usage"
          className="flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
        >
          <span
            role="meter"
            aria-valuemin={0}
            aria-valuemax={hasMax ? view.maxTokens : undefined}
            aria-valuenow={view.usedTokens}
            aria-label={localize('com_ui_context_usage')}
            className="flex items-center justify-center"
          >
            <Gauge percent={view.percent} indeterminate={!hasMax} />
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side="top" align="end" className="w-auto p-3">
          <Breakdown view={view} showCost={showCost} />
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}

/** Config gate kept outside the indicator so disabled deployments mount nothing */
const TokenUsage = memo(function TokenUsage(props: TokenUsageProps) {
  const { data: startupConfig } = useGetStartupConfig();
  /** Wait for config before mounting: until it loads `contextUsage === false`
   *  reads as undefined, so a disabled deployment would briefly mount the
   *  indicator and fire the token-config query on first load */
  if (startupConfig == null || startupConfig.interface?.contextUsage === false) {
    return null;
  }
  return (
    <TokenUsageIndicator {...props} showCost={startupConfig.interface?.contextCost === true} />
  );
});

export default TokenUsage;
