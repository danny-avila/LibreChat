import { memo, useState, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown, ChevronUp, Info, Zap } from 'lucide-react';
import type { TTokenUsage, TAgentTokenUsageEntry } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

function AgentRow({
  agent,
  isLast,
  localize,
}: {
  agent: TAgentTokenUsageEntry;
  isLast: boolean;
  localize: ReturnType<typeof useLocalize>;
}) {
  const total = agent.input_tokens + agent.output_tokens;
  const turnLabel =
    agent.turns !== 1 ? localize('com_ui_token_usage_turns') : localize('com_ui_token_usage_turn');
  const inLabel = localize('com_ui_token_usage_in');
  const outLabel = localize('com_ui_token_usage_out');

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2 text-sm',
        !isLast && 'border-b border-border-light',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary" title={agent.agentName}>
          {agent.agentName}
        </span>
        <span className="text-xs text-text-tertiary">
          {`${agent.model} · ${agent.turns} ${turnLabel}`}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-xs text-text-secondary">{formatTokenCount(total)}</span>
        <span className="text-[11px] text-text-tertiary">
          {`${formatTokenCount(agent.input_tokens)} ${inLabel} · ${formatTokenCount(agent.output_tokens)} ${outLabel}`}
        </span>
      </div>
    </div>
  );
}

function TokenUsagePanel({
  usage,
  localize,
}: {
  usage: TTokenUsage;
  localize: ReturnType<typeof useLocalize>;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const totalTokens = usage.totals.input_tokens + usage.totals.output_tokens;
  const isChain = usage.agents.length > 1;
  const inLabel = localize('com_ui_token_usage_in');
  const outLabel = localize('com_ui_token_usage_out');

  const singleAgent = !isChain ? usage.agents[0] : null;
  let singleTurnLabel = '';
  if (singleAgent) {
    singleTurnLabel =
      singleAgent.turns !== 1
        ? localize('com_ui_token_usage_turns')
        : localize('com_ui_token_usage_turn');
  }

  return (
    <div className="flex flex-col gap-0.5">
      {isChain ? (
        <>
          <div className="flex flex-col">
            {usage.agents.map((agent, idx) => (
              <AgentRow
                key={agent.agentName}
                agent={agent}
                isLast={idx === usage.agents.length - 1}
                localize={localize}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border-medium pt-1.5 text-sm">
            <div className="flex items-center gap-1">
              <span className="font-medium text-text-secondary">
                {localize('com_ui_token_usage_total')}
              </span>
              <button
                type="button"
                onClick={() => setShowInfo((prev) => !prev)}
                className="text-text-quaternary transition-colors hover:text-text-secondary"
                aria-label="Token usage info"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">
                {`${formatTokenCount(usage.totals.input_tokens)} ${inLabel} · ${formatTokenCount(usage.totals.output_tokens)} ${outLabel}`}
              </span>
              <span className="font-mono text-sm font-semibold text-text-primary">
                {formatTokenCount(totalTokens)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-text-primary">
                {singleAgent?.model ?? 'Agent'}
              </span>
              <button
                type="button"
                onClick={() => setShowInfo((prev) => !prev)}
                className="text-text-quaternary transition-colors hover:text-text-secondary"
                aria-label="Token usage info"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="font-mono text-sm font-semibold text-text-primary">
              {formatTokenCount(totalTokens)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>{`${singleAgent?.turns ?? 1} ${singleTurnLabel}`}</span>
            <span>
              {`${formatTokenCount(usage.totals.input_tokens)} ${inLabel} · ${formatTokenCount(usage.totals.output_tokens)} ${outLabel}`}
            </span>
          </div>
        </div>
      )}
      {showInfo && (
        <p className="mt-2 text-xs leading-snug text-text-tertiary">
          {localize('com_ui_token_usage_info')}
        </p>
      )}
    </div>
  );
}

function TokenUsage({
  messageId,
  persistedUsage,
}: {
  messageId: string;
  persistedUsage?: TTokenUsage;
}) {
  const localize = useLocalize();
  const tokenUsageMap = useRecoilValue(store.tokenUsageMap);
  const [isExpanded, setIsExpanded] = useState(false);

  const usage = useMemo(
    () => tokenUsageMap[messageId] ?? persistedUsage,
    [tokenUsageMap, messageId, persistedUsage],
  );

  if (!usage || !usage.agents || usage.agents.length === 0) {
    return null;
  }

  const totalTokens = usage.totals.input_tokens + usage.totals.output_tokens;
  const isChain = usage.agents.length > 1;
  const tokensLabel = localize('com_ui_token_usage_tokens');

  return (
    <div className="relative mt-1 inline-flex">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
          'text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary',
          isExpanded && 'bg-surface-tertiary text-text-secondary',
        )}
        aria-expanded={isExpanded}
      >
        <Zap className="h-3.5 w-3.5" />
        <span className="font-mono text-xs">{`${formatTokenCount(totalTokens)} ${tokensLabel}`}</span>
        {isChain && (
          <span className="text-[11px] text-text-tertiary">
            {`· ${localize('com_ui_token_usage_agents', { count: usage.agents.length })}`}
          </span>
        )}
        {isExpanded ? (
          <ChevronUp className="ml-0.5 h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="ml-0.5 h-3.5 w-3.5" />
        )}
      </button>

      {isExpanded && (
        <div className="absolute z-10 mt-8 w-96 rounded-lg border border-border-medium bg-surface-primary p-4 shadow-lg">
          <TokenUsagePanel usage={usage} localize={localize} />
        </div>
      )}
    </div>
  );
}

export default memo(TokenUsage);
