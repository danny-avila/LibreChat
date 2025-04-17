import React, { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface AgentUpdateProps {
  currentAgentId: string;
}

const AgentUpdate: React.FC<AgentUpdateProps> = ({ currentAgentId }) => {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext() || {};
  const currentAgent = useMemo(() => agentsMap[currentAgentId], [agentsMap, currentAgentId]);
  if (!currentAgentId) {
    return null;
  }
  return (
    <div className="relative">
      <div className="absolute -left-6 flex h-full w-4 items-center justify-center">
        <div className="relative h-full w-4">
          <div className="absolute left-0 top-0 h-1/2 w-px border border-border-medium"></div>
          <div className="absolute left-0 top-1/2 h-px w-3 border border-border-medium"></div>
        </div>
      </div>
      <div className="my-4 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
          <MessageIcon
            message={
              {
                endpoint: EModelEndpoint.agents,
                isCreatedByUser: false,
              } as TMessage
            }
            agent={currentAgent}
          />
        </div>
        <div className="text-base font-medium text-text-primary">
          {currentAgent?.name || localize('com_ui_agent')}
        </div>
      </div>
    </div>
  );
};

export default AgentUpdate;
