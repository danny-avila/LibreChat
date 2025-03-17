import { X, Link2, PlusCircle } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm, OptionWithIcon } from '~/common';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useAgentsMapContext } from '~/Providers';
import Icon from '~/components/Endpoints/Icon';
import { useLocalize } from '~/hooks';

interface AgentChainProps {
  field: ControllerRenderProps<AgentForm, 'agent_ids'>;
  currentAgentId: string;
}

/** TODO: make configurable */
const MAX_AGENTS = 10;

const AgentChain: React.FC<AgentChainProps> = ({ field, currentAgentId }) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');
  const agentsMap = useAgentsMapContext() || {};
  const agentIds = field.value || [];

  const agents = useMemo(() => Object.values(agentsMap), [agentsMap]);

  const selectableAgents = useMemo(
    () =>
      agents
        .filter((agent) => agent?.id !== currentAgentId)
        .map(
          (agent) =>
            ({
              label: agent?.name || '',
              value: agent?.id,
              icon: (
                <Icon
                  endpoint={EModelEndpoint.agents}
                  agentName={agent?.name ?? ''}
                  iconURL={agent?.avatar?.filepath}
                  isCreatedByUser={false}
                />
              ),
            }) as OptionWithIcon,
        ),
    [agents, currentAgentId],
  );

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
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <label className="font-semibold text-text-primary">{localize('com_ui_agent_chain')}</label>
      </div>
      <div className="space-y-1">
        {/* Current fixed agent */}
        <div className="flex h-10 items-center justify-between rounded-md border border-border-medium bg-surface-primary-contrast px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
              <Icon
                endpoint={EModelEndpoint.agents}
                agentName={getAgentDetails(currentAgentId)?.name ?? ''}
                iconURL={getAgentDetails(currentAgentId)?.avatar?.filepath}
                isCreatedByUser={false}
              />
            </div>
            <div className="font-medium text-text-primary">
              {getAgentDetails(currentAgentId)?.name}
            </div>
          </div>
        </div>
        {<Link2 className="mx-auto text-text-secondary" size={14} />}
        {agentIds.map((agentId, idx) => (
          <React.Fragment key={agentId}>
            <div className="flex h-10 items-center gap-2 rounded-md border border-border-medium bg-surface-tertiary pr-2">
              <ControlCombobox
                isCollapsed={false}
                ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_select') })}
                selectedValue={agentId}
                setValue={(id) => updateAgentAt(idx, id)}
                selectPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_select') })}
                searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
                items={selectableAgents}
                displayValue={getAgentDetails(agentId)?.name ?? ''}
                SelectIcon={
                  <Icon
                    endpoint={EModelEndpoint.agents}
                    isCreatedByUser={false}
                    agentName={getAgentDetails(agentId)?.name ?? ''}
                    iconURL={getAgentDetails(agentId)?.avatar?.filepath}
                  />
                }
                className="flex-1 border-border-heavy"
                containerClassName="px-0"
              />
              {/* Future Settings button? */}
              {/* <button className="hover:bg-surface-hover p-1 rounded transition">
                <Settings size={16} className="text-text-secondary" />
              </button> */}
              <button
                className="rounded-xl p-1 transition hover:bg-surface-hover"
                onClick={() => removeAgentAt(idx)}
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>
            {idx < agentIds.length - 1 && (
              <Link2 className="mx-auto text-text-secondary" size={14} />
            )}
          </React.Fragment>
        ))}

        {agentIds.length < MAX_AGENTS && (
          <>
            {agentIds.length > 0 && <Link2 className="mx-auto text-text-secondary" size={14} />}
            <ControlCombobox
              isCollapsed={false}
              ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
              selectedValue=""
              setValue={setNewAgentId}
              selectPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
              searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
              items={selectableAgents}
              className="h-10 w-full border-dashed border-border-heavy text-center text-text-secondary hover:text-text-primary"
              containerClassName="px-0"
              SelectIcon={<PlusCircle size={16} className="text-text-secondary" />}
            />
          </>
        )}

        {agentIds.length >= MAX_AGENTS && (
          <p className="pt-1 text-center text-xs italic text-text-tertiary">
            {localize('com_ui_agent_chain_max', { 0: MAX_AGENTS })}
          </p>
        )}
      </div>
    </div>
  );
};

export default AgentChain;
