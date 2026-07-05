import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch } from '@librechat/client';
import { Network, Users } from 'lucide-react';
import { MAX_SUBAGENTS } from 'librechat-data-provider';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { StaticAgentRow, AddAgentSelect, ListMeta, useSelectableAgents } from './AgentList';
import OrchestrationPattern from './OrchestrationPattern';
import { useLocalize } from '~/hooks';
import { ToggleSetting } from './ui';

interface AgentSubagentsProps {
  field: ControllerRenderProps<AgentForm, 'subagents'>;
  currentAgentId: string;
}

const AgentSubagents: React.FC<AgentSubagentsProps> = ({ field, currentAgentId }) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');

  const fieldValue = field.value;
  const value = useMemo(() => fieldValue ?? {}, [fieldValue]);
  const enabled = value.enabled === true;
  const allowSelf = value.allowSelf !== false;
  const agentIds = useMemo(() => value.agent_ids ?? [], [value.agent_ids]);

  const { options, getAgent } = useSelectableAgents({ currentAgentId, exclude: agentIds });

  const setEnabled = useCallback(
    (next: boolean) => {
      /**
       * Persist `{ enabled: false }` (with the existing selections preserved)
       * rather than `undefined`. The backend's `removeNullishValues` strips
       * undefined fields from PATCH payloads, so setting the whole object to
       * undefined would leave the server copy enabled. An explicit
       * `enabled: false` flows through as a real update.
       */
      field.onChange({
        enabled: next,
        allowSelf: value.allowSelf ?? true,
        agent_ids: value.agent_ids ?? [],
      });
    },
    [field, value.allowSelf, value.agent_ids],
  );

  const setAllowSelf = useCallback(
    (next: boolean) => {
      field.onChange({ ...value, enabled: true, allowSelf: next });
    },
    [field, value],
  );

  const setAgentIds = useCallback(
    (ids: string[]) => {
      field.onChange({
        ...value,
        enabled: true,
        allowSelf: value.allowSelf ?? true,
        agent_ids: ids,
      });
    },
    [field, value],
  );

  useEffect(() => {
    if (newAgentId && agentIds.length < MAX_SUBAGENTS && !agentIds.includes(newAgentId)) {
      setAgentIds([...agentIds, newAgentId]);
      setNewAgentId('');
    } else if (newAgentId) {
      setNewAgentId('');
    }
  }, [newAgentId, agentIds, setAgentIds]);

  const removeAgentAt = (index: number) => {
    setAgentIds(agentIds.filter((_, i) => i !== index));
  };

  const selfId = 'subagents-self-toggle';
  const nothingToSpawn = enabled && !allowSelf && agentIds.length === 0;

  return (
    <OrchestrationPattern
      icon={<Network className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
      title={localize('com_ui_agent_subagents')}
      subtitle={localize('com_ui_agent_subagents_subtitle')}
      beta
      info={
        <>
          <p className="text-sm text-text-secondary">{localize('com_ui_agent_subagents_info')}</p>
          <p className="text-sm text-text-secondary">{localize('com_ui_agent_subagents_info_2')}</p>
        </>
      }
      trailing={
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={localize('com_ui_agent_subagents_enable')}
        />
      }
    >
      {enabled && (
        <>
          <ToggleSetting
            id={selfId}
            label={localize('com_ui_agent_subagents_allow_self')}
            checked={allowSelf}
            onCheckedChange={setAllowSelf}
            info={
              <p className="text-sm text-text-secondary">
                {localize('com_ui_agent_subagents_allow_self_info')}
              </p>
            }
          />

          <div className="flex flex-col gap-0.5">
            <ListMeta
              label={localize('com_ui_agent_subagents_agents')}
              count={agentIds.length}
              max={MAX_SUBAGENTS}
            />

            {agentIds.map((agentId, idx) => {
              const details = getAgent(agentId);
              return (
                <StaticAgentRow
                  key={agentId}
                  agent={details}
                  name={details?.name ?? agentId}
                  onRemove={() => removeAgentAt(idx)}
                  removeLabel={localize('com_ui_agent_subagents_remove', {
                    0: details?.name ?? agentId,
                  })}
                />
              );
            })}

            {agentIds.length < MAX_SUBAGENTS && (
              <AddAgentSelect
                options={options}
                onSelect={setNewAgentId}
                placeholder={localize('com_ui_agent_subagents_add')}
                ariaLabel={localize('com_ui_agent_subagents_add')}
              />
            )}

            {agentIds.length >= MAX_SUBAGENTS && (
              <p className="pt-1 text-center text-xs italic text-text-tertiary">
                {localize('com_ui_agent_subagents_max', { 0: MAX_SUBAGENTS })}
              </p>
            )}
          </div>

          {nothingToSpawn && (
            <p className="flex items-center gap-2 text-xs italic text-amber-600 dark:text-amber-400">
              <Users size={14} aria-hidden="true" />
              {localize('com_ui_agent_subagents_empty')}
            </p>
          )}
        </>
      )}
    </OrchestrationPattern>
  );
};

export default AgentSubagents;
