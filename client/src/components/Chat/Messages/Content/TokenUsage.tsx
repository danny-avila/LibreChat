import { memo, useState, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
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
        'flex items-center justify-between gap-2 py-1.5 text-xs',
        !isLast && 'border-b border-border-light',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-text-primary">{agent.agentName}</span>
        <span className="text-[10px] text-text-tertiary">
          {`${agent.model} · ${agent.turns} ${turnLabel}`}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[11px] text-text-secondary">{formatTokenCount(total)}</span>
        <span className="text-[10px] text-text-tertiary">
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
  const totalTokens = usage.totals.input_tokens + usage.totals.output_tokens;
  const isChain = usage.agents.length > 1;
  const inLabel = localize('com_ui_token_usage_in');
  const outLabel = localize('com_ui_token_usage_out');

  return (
    <div className="flex flex-col gap-0.5">
      {isChain && (
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
      )}
      <div
        className={cn(
          'flex items-center justify-between text-xs',
          isChain && 'mt-1 border-t border-border-medium pt-1.5',
        )}
      >
        <span className="font-medium text-text-secondary">
          {isChain ? localize('com_ui_token_usage_total') : (usage.agents[0]?.agentName ?? 'Agent')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary">
            {`${formatTokenCount(usage.totals.input_tokens)} ${inLabel} · ${formatTokenCount(usage.totals.output_tokens)} ${outLabel}`}
          </span>
          <span className="font-mono text-[11px] font-semibold text-text-primary">
            {formatTokenCount(totalTokens)}
          </span>
        </div>
      </div>
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

  console.log('[TokenUsage] render', {
    messageId,
    hasRecoilData: !!tokenUsageMap[messageId],
    hasPersistedData: !!persistedUsage,
    usage: usage ? `${usage.agents?.length} agents` : 'null',
    mapKeys: Object.keys(tokenUsageMap),
  });

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
          'flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors',
          'text-text-tertiary hover:bg-surface-tertiary hover:text-text-secondary',
          isExpanded && 'bg-surface-tertiary text-text-secondary',
        )}
        aria-expanded={isExpanded}
      >
        <Zap className="h-3 w-3" />
        <span className="font-mono text-[11px]">{`${formatTokenCount(totalTokens)} ${tokensLabel}`}</span>
        {isChain && (
          <span className="text-[10px] text-text-tertiary">
            {`· ${localize('com_ui_token_usage_agents', { count: usage.agents.length })}`}
          </span>
        )}
        {isExpanded ? (
          <ChevronUp className="ml-0.5 h-3 w-3" />
        ) : (
          <ChevronDown className="ml-0.5 h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="absolute z-10 mt-7 w-72 rounded-lg border border-border-medium bg-surface-primary p-3 shadow-lg">
          <TokenUsagePanel usage={usage} localize={localize} />
        </div>
      )}
    </div>
  );
}

export default memo(TokenUsage);
