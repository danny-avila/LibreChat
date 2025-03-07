import { Plus, X, ArrowDown, Info } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { Agent } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useAgentsMapContext } from '~/Providers';
import { TooltipAnchor } from '~/components/ui';
import Icon from '~/components/Endpoints/Icon';
import HideSequential from './HideSequential';

interface SequentialAgentsProps {
  field: ControllerRenderProps<AgentForm, 'agent_ids'>;
}

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const MAX_AGENTS = Constants.MAX_CONVO_STARTERS;

const SequentialAgents: React.FC<SequentialAgentsProps> = ({ field }) => {
  const [newAgentId, setNewAgentId] = useState('');
  const agentsMap = useAgentsMapContext() || {};

  // Get current value or empty array if undefined
  const agentIds = field.value || [];
  const hasReachedMax = agentIds.length >= MAX_AGENTS;

  // Convert agents map to array for processing
  const agents = useMemo(() => Object.values(agentsMap) as Agent[], [agentsMap]);

  // Create agent options for dropdown
  const agentOptions = useMemo(
    () =>
      agents.map((agent: Agent) => ({
        label: agent.name || '',
        value: agent.id,
        icon: (
          <Icon
            isCreatedByUser={false}
            endpoint="agents"
            agentName={agent.name || ''}
            iconURL={agent.avatar?.filepath}
          />
        ),
      })),
    [agents],
  );

  // Get agent name from ID
  const getAgentName = useCallback(
    (agentId: string) => {
      if (agentsMap[agentId]?.name) {
        return agentsMap[agentId].name;
      }
      const agent = agents.find((a) => a.id === agentId);
      return agent?.name || agentId;
    },
    [agentsMap, agents],
  );

  // Get agent avatar URL from ID
  const getAgentAvatar = useCallback(
    (agentId: string) => {
      return agentsMap[agentId]?.avatar?.filepath || '';
    },
    [agentsMap],
  );

  // Add the selected agent when newAgentId changes
  useEffect(() => {
    if (newAgentId && agentIds.length < MAX_AGENTS) {
      field.onChange([...agentIds, newAgentId]);
      setNewAgentId(''); // Clear the input after adding
    }
  }, [newAgentId, agentIds, field]);

  const handleDeleteAgentId = useCallback(
    (index: number) => {
      field.onChange(agentIds.filter((_, i) => i !== index));
    },
    [agentIds, field],
  );

  const handleSelectAgent = useCallback(
    (index: number) => (value: string) => {
      const newValues = [...agentIds];
      newValues[index] = value;
      field.onChange(newValues);
    },
    [agentIds, field],
  );

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <label className={labelClass} htmlFor="agent_ids">
          Chain of Agents
        </label>
        <HideSequential />
      </div>

      {/* Simple agent chain visualization */}
      <div className="agent-chain-container px-1">
        <div className="agents-list space-y-1">
          {agentIds.map((agentId, index) => (
            <React.Fragment key={index}>
              {/* Agent selection card */}
              <div className="agent-card-wrapper relative bg-token-surface-primary rounded-md border border-token-border-light">
                <div className="agent-number absolute left-2 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded-full bg-token-surface-secondary flex items-center justify-center">
                  <span className="text-xs font-medium text-token-text-secondary">{index + 1}</span>
                </div>
                <div className="px-8 py-1">
                  <ControlCombobox
                    selectedValue={agentId}
                    displayValue={getAgentName(agentId)}
                    selectPlaceholder="Select an agent"
                    searchPlaceholder="Search agents"
                    isCollapsed={false}
                    ariaLabel={`agent-${index}`}
                    setValue={handleSelectAgent(index)}
                    items={agentOptions}
                    iconClassName="agent-item"
                    SelectIcon={
                      <Icon
                        isCreatedByUser={false}
                        endpoint="agents"
                        agentName={getAgentName(agentId)}
                        iconURL={getAgentAvatar(agentId)}
                      />
                    }
                    className="pr-10"
                  />
                  <TooltipAnchor
                    side="top"
                    description="Remove agent"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                    onClick={() => handleDeleteAgentId(index)}
                  >
                    <X className="size-4" />
                  </TooltipAnchor>
                </div>
              </div>

              {/* Arrow between agents */}
              {index < agentIds.length - 1 && (
                <div className="arrow-separator flex justify-center py-1">
                  <ArrowDown className="text-token-text-tertiary size-4" />
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Add agent button */}
          {!hasReachedMax && (
            <div className="add-agent-wrapper">
              {agentIds.length > 0 && (
                <div className="arrow-separator flex justify-center py-1">
                  <ArrowDown className="text-token-text-tertiary size-4" />
                </div>
              )}
              <div className="add-agent-card bg-token-surface-secondary rounded-md border border-dashed border-token-border-light">
                <ControlCombobox
                  selectedValue={newAgentId}
                  displayValue=""
                  selectPlaceholder={agentIds.length === 0 ? 'Select first agent in chain' : 'Add next agent to chain'}
                  searchPlaceholder="Search agents"
                  isCollapsed={false}
                  ariaLabel="new-agent"
                  setValue={setNewAgentId}
                  items={agentOptions}
                  iconClassName="agent-item"
                />
              </div>
            </div>
          )}

          {/* Max agents reached message */}
          {hasReachedMax && (
            <div className="text-xs text-token-text-tertiary py-2 italic text-center">
              Maximum chain length reached ({MAX_AGENTS} agents)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SequentialAgents;