import React, { useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useAgentsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';

interface AgentUpdateProps {
  currentAgentId: string;
}

const AgentUpdate: React.FC<AgentUpdateProps> = ({ currentAgentId }) => {
  const agentsMap = useAgentsMapContext() || {};
  const currentAgent = useMemo(() => agentsMap[currentAgentId], [agentsMap, currentAgentId]);
  if (!currentAgentId) {
    return null;
  }
  return (
    <div className="my-4 flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
        <Icon
          endpoint={EModelEndpoint.agents}
          agentName={currentAgent?.name ?? ''}
          iconURL={currentAgent?.avatar?.filepath}
          isCreatedByUser={false}
        />
      </div>
      <div className="font-medium text-text-primary">{currentAgent?.name}</div>
    </div>
  );
};

export default AgentUpdate;
