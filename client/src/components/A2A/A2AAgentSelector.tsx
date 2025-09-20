import React, { useState, useEffect } from 'react';
import { Search, Wifi, WifiOff, AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { useA2AAgents } from '~/hooks/A2A/useA2AAgents';

interface A2AAgent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
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

interface A2AAgentSelectorProps {
  onAgentSelect: (agent: A2AAgent | null) => void;
  selectedAgent: A2AAgent | null;
  className?: string;
}

export const A2AAgentSelector: React.FC<A2AAgentSelectorProps> = ({
  onAgentSelect,
  selectedAgent,
  className = '',
}) => {
  const { agents, loading, error, refreshAgents } = useA2AAgents();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Filter agents based on search and status
  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || agent.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Status indicators
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-green-500" />;
      case 'offline':
        return <WifiOff className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'offline':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  // Format capabilities
  const formatCapabilities = (capabilities: A2AAgent['capabilities']) => {
    const caps = Object.entries(capabilities)
      .filter(([_, enabled]) => enabled)
      .map(([cap, _]) => cap);
    return caps.length > 0 ? caps.join(', ') : 'None';
  };

  // Format last health check time
  const formatLastHealthCheck = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  return (
    <div className={`a2a-agent-selector ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">A2A Agents</h3>
        <button
          onClick={refreshAgents}
          disabled={loading}
          className="inline-flex items-center px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50"
          title="Refresh agents"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
          <span className="text-gray-600">Loading A2A agents...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700 font-medium">Error loading agents</span>
          </div>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={refreshAgents}
            className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredAgents.length === 0 && (
        <div className="text-center py-8">
          <Settings className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No A2A agents found</p>
          <p className="text-gray-500 text-sm mt-1">
            {agents.length === 0 
              ? 'No agents registered yet'
              : 'Try adjusting your search or filters'
            }
          </p>
        </div>
      )}

      {/* Agent List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredAgents.map((agent) => (
          <div
            key={agent.id}
            className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 ${
              selectedAgent?.id === agent.id
                ? 'border-blue-500 bg-blue-50 shadow-md'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }`}
            onClick={() => onAgentSelect(agent)}
          >
            {/* Agent Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h4 className="font-medium text-gray-900">{agent.name}</h4>
                  {getStatusIcon(agent.status)}
                </div>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                  {agent.description}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(showDetails === agent.id ? null : agent.id);
                }}
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Toggle details"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {/* Agent Status Badge */}
            <div className="flex items-center space-x-2 mb-2">
              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(agent.status)}`}>
                {agent.status.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">
                {formatLastHealthCheck(agent.lastHealthCheck)}
              </span>
            </div>

            {/* Capabilities Preview */}
            <div className="flex flex-wrap gap-1 mb-2">
              {Object.entries(agent.capabilities)
                .filter(([_, enabled]) => enabled)
                .slice(0, 3)
                .map(([cap, _]) => (
                  <span
                    key={cap}
                    className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                  >
                    {cap}
                  </span>
                ))
              }
              {Object.values(agent.capabilities).filter(Boolean).length > 3 && (
                <span className="text-xs text-gray-500">
                  +{Object.values(agent.capabilities).filter(Boolean).length - 3} more
                </span>
              )}
            </div>

            {/* Expanded Details */}
            {showDetails === agent.id && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                {/* Transport */}
                <div>
                  <span className="text-xs font-medium text-gray-700">Transport:</span>
                  <span className="ml-2 text-xs text-gray-600">{agent.transport}</span>
                </div>

                {/* All Capabilities */}
                <div>
                  <span className="text-xs font-medium text-gray-700">Capabilities:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(agent.capabilities).map(([cap, enabled]) => (
                      <span
                        key={cap}
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Skills */}
                {agent.skills.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Skills:</span>
                    <div className="mt-1 space-y-1">
                      {agent.skills.slice(0, 3).map((skill) => (
                        <div key={skill.id} className="text-xs">
                          <span className="font-medium text-gray-600">{skill.name}:</span>
                          <span className="ml-1 text-gray-500">{skill.description}</span>
                        </div>
                      ))}
                      {agent.skills.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{agent.skills.length - 3} more skills
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Agent ID */}
                <div>
                  <span className="text-xs font-medium text-gray-700">Agent ID:</span>
                  <span className="ml-2 text-xs text-gray-600 font-mono">{agent.id}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected Agent Summary */}
      {selectedAgent && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-blue-900">Selected:</span>
              <span className="ml-2 text-sm text-blue-700">{selectedAgent.name}</span>
            </div>
            <button
              onClick={() => onAgentSelect(null)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};