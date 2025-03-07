import { Plus, X } from 'lucide-react';
import { Transition } from 'react-transition-group';
import { Constants } from 'librechat-data-provider';
import React, { useRef, useState, useMemo, useCallback } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { Agent } from 'librechat-data-provider';
import type { OptionWithIcon, AgentForm } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useAgentsMapContext } from '~/Providers';
import { TooltipAnchor } from '~/components/ui';
import Icon from '~/components/Endpoints/Icon';
import HideSequential from './HideSequential';

interface SequentialAgentsProps {
  field: ControllerRenderProps<AgentForm, 'agent_ids'>;
}

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const maxAgents = 5;

const SequentialAgents: React.FC<SequentialAgentsProps> = ({ field }) => {
  const nodeRef = useRef(null);
  const [newAgentId, setNewAgentId] = useState('');

  // Get agents from context
  const agentsMapResult = useAgentsMapContext();

  // Convert agents map to array
  const agents: Agent[] = useMemo(() => {
    console.log('agentsMapResult:', agentsMapResult);
    return agentsMapResult ? (Object.values(agentsMapResult) as Agent[]) : [];
  }, [agentsMapResult]);

  // Create a map of agent IDs to agent names for efficient lookups
  const agentNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    agents.forEach((agent) => {
      if (agent.id && agent.name) {
        map[agent.id] = agent.name;
      }
    });
    console.log('agentNamesMap:', map);
    return map;
  }, [agents]);

  // Function to get agent name from ID
  const getAgentName = useCallback(
    (agentId: string) => {
      console.log(`Getting name for agent ${agentId}`);

      // First try the agentNamesMap
      if (agentNamesMap[agentId]) {
        console.log(`Found in agentNamesMap: ${agentNamesMap[agentId]}`);
        return agentNamesMap[agentId];
      }

      // If not found, try to find it in the agents array
      const agent = agents.find((a) => a.id === agentId);
      if (agent?.name) {
        console.log(`Found in agents array: ${agent.name}`);
        return agent.name;
      }

      // If still not found, try the agentsMapResult directly
      if (agentsMapResult?.[agentId]?.name) {
        console.log(`Found in agentsMapResult: ${agentsMapResult[agentId].name}`);
        return agentsMapResult[agentId].name;
      }

      // Fall back to the agent ID
      console.log(`No name found, using ID: ${agentId}`);
      return agentId;
    },
    [agentNamesMap, agents, agentsMapResult],
  );

  // Create options for dropdown
  const agentOptions: OptionWithIcon[] = useMemo(
    () =>
      agents.map((agent: Agent) => {
        return {
          label: agent.name ?? '',
          value: agent.id,
          icon: (
            <Icon
              isCreatedByUser={false}
              endpoint="agents"
              agentName={agent.name ?? ''}
              iconURL={agent.avatar?.filepath}
            />
          ),
        };
      }),
    [agents],
  );

  const handleAddAgentId = () => {
    if (newAgentId && (field.value?.length ?? 0) < maxAgents) {
      const newValues = [...(field.value ?? []), newAgentId];
      field.onChange(newValues);
    }
  };

  const handleDeleteAgentId = (index: number) => {
    const newValues = field.value?.filter((_, i) => i !== index);
    field.onChange(newValues);
  };

  const handleSelectAgent = (index: number) => (value: string) => {
    const newValues = [...(field.value ?? [])];
    newValues[index] = value;
    field.onChange(newValues);
  };

  const handleSelectNewAgent = (value: string) => {
    setNewAgentId(value);
  };

  const defaultStyle = {
    transition: 'opacity 200ms ease-in-out',
    opacity: 0,
  };

  const triggerShake = (element: HTMLElement) => {
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
    setTimeout(() => {
      element.classList.remove('shake');
    }, 200);
  };

  const transitionStyles = {
    entering: { opacity: 1 },
    entered: { opacity: 1 },
    exiting: { opacity: 0 },
    exited: { opacity: 0 },
  };

  const hasReachedMax = (field.value?.length ?? 0) >= Constants.MAX_CONVO_STARTERS;

  return (
    <div className="relative">
      <label className={labelClass} htmlFor="agent_ids">
        {/* Sequential Agents */}
      </label>
      <div className="mt-4 space-y-2">
        <HideSequential />
        {/* Display existing agents first */}
        {field.value?.map((agentId, index) => {
          console.log(`Agent ${index}:`, agentId);
          console.log(
            'Found agent:',
            agents.find((agent) => agent.id === agentId),
          );
          return (
            <div key={index} className="relative">
              <ControlCombobox
                selectedValue={agentId}
                displayValue={getAgentName(agentId)}
                selectPlaceholder="Select an agent"
                searchPlaceholder="Search agents"
                isCollapsed={false}
                ariaLabel="agent"
                setValue={handleSelectAgent(index)}
                items={agentOptions}
                iconClassName="agent-item"
                SelectIcon={
                  <Icon
                    isCreatedByUser={false}
                    endpoint="agents"
                    agentName={getAgentName(agentId)}
                    iconURL={agentsMapResult?.[agentId]?.avatar?.filepath ?? ''}
                  />
                }
                className="pr-10"
              />
              <TooltipAnchor
                side="top"
                description={'Remove agent'}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                onClick={() => handleDeleteAgentId(index)}
              >
                <X className="size-4" />
              </TooltipAnchor>
            </div>
          );
        })}
        {/* Input for new agent at the bottom */}
        <div className="relative">
          <ControlCombobox
            selectedValue={newAgentId}
            displayValue={newAgentId ? getAgentName(newAgentId) : ''}
            selectPlaceholder={hasReachedMax ? 'Max agents reached' : 'Select an agent to add'}
            searchPlaceholder="Search agents"
            isCollapsed={false}
            ariaLabel="new-agent"
            setValue={handleSelectNewAgent}
            items={agentOptions}
            iconClassName="agent-item"
            disabled={hasReachedMax}
            SelectIcon={
              newAgentId ? (
                <Icon
                  isCreatedByUser={false}
                  endpoint="agents"
                  agentName={getAgentName(newAgentId)}
                  iconURL={agentsMapResult?.[newAgentId]?.avatar?.filepath ?? ''}
                />
              ) : undefined
            }
            className="pr-10"
          />
          <Transition
            nodeRef={nodeRef}
            in={(field.value?.length ?? 0) < Constants.MAX_CONVO_STARTERS}
            timeout={200}
            unmountOnExit
          >
            {(state: string) => (
              <div
                ref={nodeRef}
                style={{
                  ...defaultStyle,
                  ...transitionStyles[state as keyof typeof transitionStyles],
                  transition: state === 'entering' ? 'none' : defaultStyle.transition,
                }}
                className="absolute right-1 top-1"
              >
                <TooltipAnchor
                  side="top"
                  description={hasReachedMax ? 'Max agents reached' : 'Add agent'}
                  className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
                  onClick={handleAddAgentId}
                  disabled={hasReachedMax}
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
