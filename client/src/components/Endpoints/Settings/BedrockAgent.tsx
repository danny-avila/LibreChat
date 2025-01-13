import { useEffect, useState } from 'react';
import type { TEndpointOption } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import store from '~/store';

interface BedrockAgent {
  agentId: string;
  agentName?: string;
  description?: string;
  status: string;
}

interface BedrockAgentProps {
  conversation: TEndpointOption;
  setOption: (param: string, value: string | number | boolean | null) => void;
}

export default function BedrockAgent({ conversation, setOption }: BedrockAgentProps) {
  const [agents, setAgents] = useState<BedrockAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const setConversation = useSetRecoilState(store.conversation);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('/api/bedrock/agents');
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch agents');
        }
        
        setAgents(data.agents || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch agents');
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading agents...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-900 dark:text-gray-300">
        Select AWS Bedrock Agent
      </label>
      <select
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        value={conversation.agentId || ''}
        onChange={(e) => {
          const selectedAgent = agents.find(agent => agent.agentId === e.target.value);
          setOption('agentId', e.target.value);
          setConversation((prev) => ({
            ...prev,
            endpoint: EModelEndpoint.bedrockAgent,
            agentId: e.target.value,
            modelDisplayLabel: selectedAgent?.agentName || e.target.value,
          }));
        }}
      >
        <option value="">Choose an agent</option>
        {agents.map((agent) => (
          <option key={agent.agentId} value={agent.agentId}>
            {agent.agentName || agent.agentId}
          </option>
        ))}
      </select>
    </div>
  );
}
