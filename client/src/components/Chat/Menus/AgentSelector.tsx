import { useMemo } from 'react';
import { useAgentsMapContext } from '~/Providers';
import { useSelectAgent } from '~/hooks';
import { shouldShowAgentButtons } from '~/config/agentDefaults';

function getAvatarUrl(avatar?: { filepath?: string; source?: string }) {
  if (!avatar?.filepath) return undefined;
  return avatar.filepath;
}

export default function AgentSelector() {
  const agentsMap = useAgentsMapContext();
  const { onSelect: onSelectAgent } = useSelectAgent();

  const shouldShow = useMemo(() => {
    return shouldShowAgentButtons() && agentsMap && Object.keys(agentsMap).length > 0;
  }, [agentsMap]);

  if (!shouldShow) {
    return null;
  }

  const agents = useMemo(() => {
    return Object.values(agentsMap).slice(0, 3); // Show only first 3 agents
  }, [agentsMap]);

  const handleSelectAgent = (agent_id: string | undefined) => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  };

  return (
    <div className="flex items-center gap-2 px-2">
      <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
      {agents.map((agent: any) => (
        <button
          key={agent.id || agent.name}
          onClick={(e) => {
            e.preventDefault();
            handleSelectAgent(agent.id);
          }}
          title={agent.name}
          className="flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-medium text-gray-700 transition-all duration-200 ease-in-out hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {agent.avatar?.filepath ? (
            <img
              src={getAvatarUrl(agent.avatar)}
              alt={agent.name ?? `${agent.id}_avatar`}
              className="h-6 w-6 rounded-full border border-gray-300 object-cover dark:border-gray-600"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs dark:bg-gray-700">
              🤖
            </span>
          )}
          <span className="hidden sm:inline max-w-[80px] truncate">{agent.name}</span>
        </button>
      ))}
    </div>
  );
}
