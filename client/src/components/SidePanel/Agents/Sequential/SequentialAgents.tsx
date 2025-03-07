import { Plus, X } from 'lucide-react';
import { Transition } from 'react-transition-group';
import { Constants } from 'librechat-data-provider';
import React, { useRef, useState, useMemo, useCallback } from 'react';
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

// Transition styles for animations
const transitionConfig = {
  defaultStyle: {
    transition: 'opacity 200ms ease-in-out',
    opacity: 0,
  },
  styles: {
    entering: { opacity: 1 },
    entered: { opacity: 1 },
    exiting: { opacity: 0 },
    exited: { opacity: 0 },
  },
};

const SequentialAgents: React.FC<SequentialAgentsProps> = ({ field }) => {
  const nodeRef = useRef(null);
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

  // Get agent name from ID - efficient lookup with fallbacks
  const getAgentName = useCallback(
    (agentId: string) => {
      // Direct lookup from agentsMap is most efficient
      if (agentsMap[agentId]?.name) {
        return agentsMap[agentId].name;
      }

      // Fallback to finding in the agents array
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

  // Event handlers
  const handleAddAgentId = useCallback(() => {
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

  // Render agent selection item
  const renderAgentItem = useCallback(
    (agentId: string, index: number) => (
      <div key={index} className="relative">
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
          className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
          onClick={() => handleDeleteAgentId(index)}
        >
          <X className="size-4" />
        </TooltipAnchor>
      </div>
    ),
    [agentOptions, getAgentName, getAgentAvatar, handleSelectAgent, handleDeleteAgentId],
  );

  return (
    <div className="relative">
      <label className={labelClass} htmlFor="agent_ids">
        {/* Sequential Agents */}
      </label>
      <div className="mt-4 space-y-2">
        <HideSequential />

        {/* Display existing agents */}
        {agentIds.map(renderAgentItem)}

        {/* Input for new agent */}
        <div className="relative">
          <ControlCombobox
            selectedValue={newAgentId}
            displayValue={newAgentId ? getAgentName(newAgentId) : ''}
            selectPlaceholder={hasReachedMax ? 'Max agents reached' : 'Select an agent to add'}
            searchPlaceholder="Search agents"
            isCollapsed={false}
            ariaLabel="new-agent"
            setValue={setNewAgentId}
            items={agentOptions}
            iconClassName="agent-item"
            disabled={hasReachedMax}
            SelectIcon={
              newAgentId ? (
                <Icon
                  isCreatedByUser={false}
                  endpoint="agents"
                  agentName={getAgentName(newAgentId)}
                  iconURL={getAgentAvatar(newAgentId)}
                />
              ) : undefined
            }
            className="pr-10"
          />
          <Transition nodeRef={nodeRef} in={!hasReachedMax} timeout={200} unmountOnExit>
            {(state: string) => (
              <div
                ref={nodeRef}
                style={{
                  ...transitionConfig.defaultStyle,
                  ...transitionConfig.styles[state as keyof typeof transitionConfig.styles],
                  transition:
                    state === 'entering' ? 'none' : transitionConfig.defaultStyle.transition,
                }}
                className="absolute right-1 top-1"
              >
                <TooltipAnchor
                  side="top"
                  description="Add agent"
                  className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                  onClick={handleAddAgentId}
                  disabled={!newAgentId || hasReachedMax}
                >
                  <Plus className="size-4" />
                </TooltipAnchor>
              </div>
            )}
          </Transition>
        </div>
      </div>
    </div>
  );
};

export default SequentialAgents;
