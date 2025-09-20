import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings, RefreshCw } from 'lucide-react';
import { A2AAgentSelector } from './A2AAgentSelector';
import { A2AConversationHandler } from './A2AConversationHandler';
import { useA2AAgents } from '~/hooks/A2A/useA2AAgents';

interface A2AAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  agentCardUrl: string;
  preferredTransport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  capabilities: {
    streaming?: boolean;
    push?: boolean;
    multiTurn?: boolean;
    taskBased?: boolean;
    tools?: boolean;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  transport: 'JSONRPC' | 'HTTP+JSON' | 'GRPC';
  lastHealthCheck?: string;
  createdAt: string;
}

interface A2AChatInterfaceProps {
  conversationId?: string;
  initialAgentId?: string;
  onAgentChange?: (agent: A2AAgent | null) => void;
  onMessage?: (message: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export const A2AChatInterface: React.FC<A2AChatInterfaceProps> = ({
  conversationId,
  initialAgentId,
  onAgentChange,
  onMessage,
  onError,
  className = ''
}) => {
  const { agents, loading, error, refreshAgents } = useA2AAgents();
  const [selectedAgent, setSelectedAgent] = useState<A2AAgent | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize with the specified agent if available
  useEffect(() => {
    if (initialAgentId && agents.length > 0 && !selectedAgent) {
      const agent = agents.find(a => a.id === initialAgentId);
      if (agent) {
        setSelectedAgent(agent);
        onAgentChange?.(agent);
      }
    }
  }, [initialAgentId, agents, selectedAgent, onAgentChange]);

  const handleAgentSelect = (agent: A2AAgent | null) => {
    setSelectedAgent(agent);
    onAgentChange?.(agent);
  };

  const handleBackToSelection = () => {
    setSelectedAgent(null);
    onAgentChange?.(null);
  };

  const handleRefreshAgents = async () => {
    try {
      await refreshAgents();
    } catch (err) {
      onError?.('Failed to refresh agents');
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Loading A2A agents...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">
            <p className="text-lg font-medium">Failed to load A2A agents</p>
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={handleRefreshAgents}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <RefreshCw className="mr-2 h-4 w-4 inline" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show agent selector if no agent is selected
  if (!selectedAgent) {
    return (
      <div className={`h-full ${className}`}>
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Select an A2A Agent
            </h2>
            <button
              onClick={handleRefreshAgents}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Refresh agents"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <A2AAgentSelector
          onAgentSelect={handleAgentSelect}
          selectedAgent={selectedAgent}
          className="flex-1"
        />
      </div>
    );
  }

  // Show conversation interface with selected agent
  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToSelection}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Back to agent selection"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedAgent.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedAgent.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Agent Status */}
            <div className="flex items-center gap-1">
              <div 
                className={`h-2 w-2 rounded-full ${
                  selectedAgent.status === 'online' 
                    ? 'bg-green-500' 
                    : selectedAgent.status === 'offline'
                    ? 'bg-gray-500'
                    : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {selectedAgent.status}
              </span>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              title="Agent settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Agent Details Panel */}
        {showSettings && (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <h3 className="mb-3 font-medium text-gray-900 dark:text-gray-100">
              Agent Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Transport:</span>
                <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedAgent.transport}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Capabilities:</span>
                <div className="ml-2 mt-1 flex flex-wrap gap-1">
                  {Object.entries(selectedAgent.capabilities)
                    .filter(([_, enabled]) => enabled)
                    .map(([capability]) => (
                      <span
                        key={capability}
                        className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        {capability}
                      </span>
                    ))}
                </div>
              </div>
            </div>
            {selectedAgent.skills.length > 0 && (
              <div className="mt-3">
                <span className="font-medium text-gray-700 dark:text-gray-300">Available Skills:</span>
                <div className="mt-1 space-y-1">
                  {selectedAgent.skills.map((skill) => (
                    <div key={skill.id} className="text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">{skill.name}:</span>
                      <span className="ml-1 text-gray-500 dark:text-gray-500">{skill.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Conversation */}
      <A2AConversationHandler
        agent={selectedAgent}
        conversationId={conversationId}
        onMessageSent={onMessage}
        onError={onError}
        className="flex-1"
      />
    </div>
  );
};

export default A2AChatInterface;