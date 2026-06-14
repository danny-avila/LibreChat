import React, { useMemo, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { Clipboard, CheckMark, TooltipAnchor } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { MouseEvent } from 'react';
import MessageIcon from '~/components/Share/MessageIcon';
import { useLocalize, useExpandCollapse } from '~/hooks';
import { useAgentsMapContext } from '~/Providers';
import { cn } from '~/utils';

interface AgentHandoffProps {
  name: string;
  args: string | Record<string, unknown>;
}

const AgentHandoff: React.FC<AgentHandoffProps> = ({ name, args: _args = '' }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const [showInfo, setShowInfo] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showInfo);

  const targetAgentId = useMemo(() => {
    if (typeof name !== 'string' || !name.startsWith(Constants.LC_TRANSFER_TO_)) {
      return null;
    }
    return name.replace(Constants.LC_TRANSFER_TO_, '');
  }, [name]);

  const targetAgent = useMemo(() => {
    if (!targetAgentId || !agentsMap) {
      return null;
    }
    return agentsMap[targetAgentId];
  }, [agentsMap, targetAgentId]);

  const args = useMemo(() => {
    if (typeof _args === 'string') {
      return _args;
    }
    try {
      return JSON.stringify(_args, null, 2);
    } catch {
      return '';
    }
  }, [_args]) as string;

  const hasInfo = useMemo(() => (args?.trim()?.length ?? 0) > 2, [args]);
  const agentName = targetAgent?.name || localize('com_ui_agent');

  const handleCopy = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      navigator.clipboard.writeText(args);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    },
    [args],
  );

  const copyLabel = isCopied
    ? localize('com_ui_copied_to_clipboard')
    : localize('com_ui_copy_to_clipboard');

  return (
    <div className="my-1.5">
      <button
        type="button"
        className={cn(
          'tool-status-text flex appearance-none items-center gap-2.5 bg-transparent text-text-secondary',
          hasInfo
            ? 'transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy'
            : 'pointer-events-none',
        )}
        disabled={!hasInfo}
        onClick={hasInfo ? () => setShowInfo(!showInfo) : undefined}
        aria-expanded={hasInfo ? showInfo : undefined}
        aria-label={`${localize('com_ui_transferred_to')} ${agentName}`}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border-light">
          <MessageIcon
            message={
              {
                endpoint: EModelEndpoint.agents,
                isCreatedByUser: false,
              } as TMessage
            }
            agent={targetAgent || undefined}
          />
        </div>
        <span className="select-none">{localize('com_ui_transferred_to')}</span>
        <span className="select-none font-medium text-text-primary">{agentName}</span>
        {hasInfo && (
          <ChevronDown
            className={cn(
              'size-4 shrink-0 translate-y-[1px] text-text-secondary transition-transform duration-200 ease-out',
              showInfo && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </button>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasInfo && (
            <div className="group/handoff my-2 ml-8 rounded-xl border border-border-light bg-surface-secondary p-4 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {localize('com_ui_handoff_instructions')}
                </span>
                <TooltipAnchor
                  description={copyLabel}
                  render={
                    <button
                      type="button"
                      onClick={handleCopy}
                      aria-label={copyLabel}
                      className={cn(
                        'flex shrink-0 items-center justify-center rounded-lg p-1 text-text-tertiary transition-opacity duration-150',
                        'opacity-0 group-focus-within/handoff:opacity-100 group-hover/handoff:opacity-100',
                        'hover:bg-surface-hover hover:text-text-primary',
                        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy',
                      )}
                    >
                      {isCopied ? (
                        <CheckMark className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Clipboard size="14" aria-hidden="true" />
                      )}
                    </button>
                  }
                />
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap leading-relaxed text-text-primary">
                {args}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentHandoff;
