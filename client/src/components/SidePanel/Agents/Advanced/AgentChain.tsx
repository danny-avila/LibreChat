import React, { useState, useMemo, useEffect } from 'react';
import { Link2, ListOrdered } from 'lucide-react';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  AgentGlyph,
  AgentRow,
  agentIcon,
  AddAgentSelect,
  AgentSelectInline,
  useSelectableAgents,
} from './AgentList';
import OrchestrationPattern from './OrchestrationPattern';
import { useLocalize } from '~/hooks';
import { CountPill } from './ui';

interface AgentChainProps {
  field: ControllerRenderProps<AgentForm, 'agent_ids'>;
  currentAgentId: string;
}

/** TODO: make configurable */
const MAX_AGENTS = 10;

const Connector = () => (
  <Link2 className="mx-auto text-text-tertiary" size={14} aria-hidden="true" />
);

const AgentChain: React.FC<AgentChainProps> = ({ field, currentAgentId }) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');
  const agentIds = useMemo(() => field.value ?? [], [field.value]);

  const { options, getAgent } = useSelectableAgents({ currentAgentId });

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

  const currentAgent = currentAgentId ? getAgent(currentAgentId) : undefined;
  const currentName = currentAgent?.name?.trim();

  return (
    <OrchestrationPattern
      icon={<ListOrdered className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
      title={localize('com_ui_agent_chain')}
      subtitle={localize('com_ui_agent_chain_subtitle')}
      info={<p className="text-sm text-text-secondary">{localize('com_ui_agent_chain_info')}</p>}
      trailing={
        <CountPill>
          {agentIds.length} / {MAX_AGENTS}
        </CountPill>
      }
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1 py-1">
          {currentName ? (
            <>
              <AgentGlyph agent={currentAgent} />
              <span className="truncate text-sm font-medium text-text-primary">{currentName}</span>
            </>
          ) : (
            <span className="text-sm font-medium text-text-secondary">
              {localize('com_ui_agent_chain_self')}
            </span>
          )}
        </div>

        {agentIds.map((agentId, idx) => (
          <React.Fragment key={`${agentId}-${idx}`}>
            <Connector />
            <AgentRow
              onRemove={() => removeAgentAt(idx)}
              removeLabel={localize('com_ui_remove_agent_from_chain', {
                0: getAgent(agentId)?.name || localize('com_ui_agent'),
              })}
            >
              <AgentSelectInline
                options={options}
                selectedValue={agentId}
                onChange={(id) => updateAgentAt(idx, id)}
                displayValue={getAgent(agentId)?.name ?? ''}
                icon={agentIcon(getAgent(agentId))}
                ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_select') })}
              />
            </AgentRow>
          </React.Fragment>
        ))}

        {agentIds.length < MAX_AGENTS && (
          <>
            <Connector />
            <AddAgentSelect
              options={options}
              onSelect={setNewAgentId}
              placeholder={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
              ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
            />
          </>
        )}

        {agentIds.length >= MAX_AGENTS && (
          <p className="pt-1 text-center text-xs italic text-text-tertiary">
            {localize('com_ui_agent_chain_max', { 0: MAX_AGENTS })}
          </p>
        )}
      </div>
    </OrchestrationPattern>
  );
};

export default AgentChain;
