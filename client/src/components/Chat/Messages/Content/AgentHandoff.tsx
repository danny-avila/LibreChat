import React, { useMemo, useState } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import { ChevronDown } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AgentHandoffProps {
  name: string;
  args: string | Record<string, unknown>;
  output?: string | null;
}

const AgentHandoff: React.FC<AgentHandoffProps> = ({ name, args: _args = '' }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const [showInfo, setShowInfo] = useState(false);

  /** Extracted agent ID from tool name (e.g., "lc_transfer_to_agent_gUV0wMb7zHt3y3Xjz-8_4" -> "agent_gUV0wMb7zHt3y3Xjz-8_4") */
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

  /** Requires more than 2 characters as can be an empty object: `{}` */
  const hasInfo = useMemo(() => (args?.trim()?.length ?? 0) > 2, [args]);

  return (
    <div className="my-3">
      <div
        className={cn(
          'flex items-center gap-2.5 text-sm text-text-secondary',
          hasInfo && 'cursor-pointer transition-colors hover:text-text-primary',
        )}
        onClick={() => hasInfo && setShowInfo(!showInfo)}
      >
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
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
        <span className="select-none font-medium text-text-primary">
          {targetAgent?.name || localize('com_ui_agent')}
        </span>
        {hasInfo && (
          <ChevronDown
            className={cn('ml-1 h-3 w-3 transition-transform', showInfo && 'rotate-180')}
            aria-hidden="true"
          />
        )}
      </div>
      {hasInfo && showInfo && (
        <div className="ml-8 mt-2 rounded-md bg-surface-secondary p-3 text-xs">
          <div className="mb-1 font-medium text-text-secondary">
            {localize('com_ui_handoff_instructions')}:
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-text-primary">{args}</pre>
        </div>
      )}
    </div>
  );
};

export default AgentHandoff;
