import { X, ChevronDown, Settings } from 'lucide-react';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm, OptionWithIcon } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useAgentsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';
// import HideSequential from './HideSequential';
import { useLocalize } from '~/hooks';

interface SequentialAgentsProps {
  field: ControllerRenderProps<AgentForm, 'agent_ids'>;
  currentAgentId: string;
}

const MAX_AGENTS = 10;

const SequentialAgents: React.FC<SequentialAgentsProps> = ({ field, currentAgentId }) => {
  const [newAgentId, setNewAgentId] = useState('');
  const agentsMap = useAgentsMapContext() || {};
  const agentIds = field.value || [];

  const agents = useMemo(() => Object.values(agentsMap), [agentsMap]);

  const selectableAgents = useMemo(() =>
    agents
      .filter(agent => agent?.id !== currentAgentId)
      .map((agent) => ({
        label: agent?.name || '',
        value: agent?.id,
        icon: <Icon endpoint="agents" agentName={agent?.name ?? ''} iconURL={agent?.avatar?.filepath} isCreatedByUser={false}/>,
      } as OptionWithIcon)), [agents, currentAgentId]);

  const getAgentDetails = useCallback((id: string) => agentsMap[id], [agentsMap]);

  useEffect(() => {
    if (newAgentId && agentIds.length < MAX_AGENTS) {
      field.onChange([...agentIds, newAgentId]);
      setNewAgentId('');
    }
  }, [newAgentId, agentIds, field]);

  const removeAgentAt = (index: number) => {
    field.onChange(agentIds.filter((_, i) => i !== index));
  };

  const updateAgentAt = (index: number, id: string) => {
    const updated = [...agentIds];
    updated[index] = id;
    field.onChange(updated);
  };

  return (
    <div className="p-4 rounded-md border border-border-medium bg-surface-secondary">
      <div className="flex justify-between items-center mb-4">
        <label className="text-text-primary font-semibold">Agent Chain</label>
        {/* <HideSequential /> */}
      </div>

      <div className="space-y-1">
        {/* Current fixed agent */}
        <div className="flex justify-between items-center rounded-md py-2 px-3 bg-surface-primary-contrast border border-border-medium">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
              <Icon endpoint="agents" agentName={getAgentDetails(currentAgentId)?.name ?? ''} iconURL={getAgentDetails(currentAgentId)?.avatar?.filepath} isCreatedByUser={false} />
            </div>
            <div className="truncate text-text-primary font-medium">
              {getAgentDetails(currentAgentId)?.name} (Current Agent)
            </div>
          </div>
        </div>

        {agentIds.length > 0 && <ChevronDown className="text-text-secondary mx-auto" size={14} />}

        {agentIds.map((agentId, idx) => (
          <React.Fragment key={agentId}>
            <div className="flex items-center gap-2 py-2 px-3 bg-surface-tertiary rounded-md border border-border-medium">
              <ControlCombobox
                isCollapsed={false}
                ariaLabel='Select agent'
                selectedValue={agentId}
                setValue={(id) => updateAgentAt(idx, id)}
                selectPlaceholder="Select agent"
                searchPlaceholder="Search..."
                items={selectableAgents}
                displayValue={getAgentDetails(agentId)?.name ?? ''}
                SelectIcon={
                  <Icon
                    endpoint="agents"
                    isCreatedByUser={false}
                    agentName={getAgentDetails(agentId)?.name ?? ''}
                    iconURL={getAgentDetails(agentId)?.avatar?.filepath}
                  />
                }
                className="flex-1 border-border-heavy"
              />
              {/* Future Settings button? */}
              {/* <button className="hover:bg-surface-hover p-1 rounded transition">
                <Settings size={16} className="text-text-secondary" />
              </button> */}
              <button className="p-1 hover:bg-surface-hover rounded-md transition"
                onClick={() => removeAgentAt(idx)}>
                <X size={16} className="text-text-secondary"/>
              </button>
            </div>
            {idx < agentIds.length - 1 && <ChevronDown className="text-text-secondary mx-auto" size={14} />}
          </React.Fragment>
        ))}

        {agentIds.length < MAX_AGENTS && (
          <>
            {agentIds.length > 0 && <ChevronDown className="text-text-secondary mx-auto" size={14} />}
            <ControlCombobox
              isCollapsed={false}
              ariaLabel='Select agent'
              selectedValue=""
              setValue={setNewAgentId}
              selectPlaceholder={agentIds.length === 0 ? 'Add first agent...' : 'Add next agent...'}
              searchPlaceholder="Search agents"
              items={selectableAgents}
              className="text-text-secondary w-full p-2 text-center border-border-heavy border-dashed"
            >

            </ControlCombobox>
          </>
        )}

        {agentIds.length >= MAX_AGENTS && (
          <p className="text-xs italic text-text-tertiary text-center pt-1">
            You have reached the maximum of {MAX_AGENTS} agents.
          </p>
        )}
      </div>
    </div>
  );
};

export default SequentialAgents;