import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { X, Waypoints, PlusCircle, ChevronDown } from 'lucide-react';
import {
  Label,
  Input,
  Textarea,
  HoverCard,
  CircleHelpIcon,
  HoverCardPortal,
  ControlCombobox,
  HoverCardContent,
  HoverCardTrigger,
} from '@librechat/client';
import type { TMessage, GraphEdge } from 'librechat-data-provider';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm, OptionWithIcon } from '~/common';
import MessageIcon from '~/components/Share/MessageIcon';
import { useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

interface AgentHandoffsProps {
  field: ControllerRenderProps<AgentForm, 'edges'>;
  currentAgentId: string;
}

/** TODO: make configurable */
const MAX_HANDOFFS = 10;

const AgentHandoffs: React.FC<AgentHandoffsProps> = ({ field, currentAgentId }) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const agentsMap = useAgentsMapContext();
  const edgesValue = field.value;
  const edges = useMemo(() => edgesValue || [], [edgesValue]);

  const agents = useMemo(() => (agentsMap ? Object.values(agentsMap) : []), [agentsMap]);

  const selectableAgents = useMemo(
    () =>
      agents
        .filter((agent) => agent?.id !== currentAgentId)
        .map(
          (agent) =>
            ({
              label: agent?.name || '',
              value: agent?.id || '',
              icon: (
                <MessageIcon
                  message={
                    {
                      endpoint: EModelEndpoint.agents,
                      isCreatedByUser: false,
                    } as TMessage
                  }
                  agent={agent}
                />
              ),
            }) as OptionWithIcon,
        ),
    [agents, currentAgentId],
  );

  const getAgentDetails = useCallback((id: string) => agentsMap?.[id], [agentsMap]);

  useEffect(() => {
    if (newAgentId && edges.length < MAX_HANDOFFS) {
      const newEdge: GraphEdge = {
        from: currentAgentId,
        to: newAgentId,
        edgeType: 'handoff',
      };
      field.onChange([...edges, newEdge]);
      setNewAgentId('');
    }
  }, [newAgentId, edges, field, currentAgentId]);

  const removeHandoffAt = (index: number) => {
    field.onChange(edges.filter((_, i) => i !== index));
    // Also remove from expanded set
    setExpandedIndices((prev) => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const updateHandoffAt = (index: number, agentId: string) => {
    const updated = [...edges];
    updated[index] = { ...updated[index], to: agentId };
    field.onChange(updated);
  };

  const updateHandoffDetailsAt = (index: number, updates: Partial<GraphEdge>) => {
    const updated = [...edges];
    updated[index] = { ...updated[index], ...updates };
    field.onChange(updated);
  };

  const toggleExpanded = (index: number) => {
    setExpandedIndices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const getTargetAgentId = (to: string | string[]): string => {
    return Array.isArray(to) ? to[0] : to;
  };

  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-text-primary">
            {localize('com_ui_agent_handoffs')}
          </label>
          <HoverCardTrigger>
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </HoverCardTrigger>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-purple-600/40 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-700/10 dark:text-purple-400">
            {localize('com_ui_beta')}
          </div>
          <div className="text-xs text-text-secondary">
            {edges.length} / {MAX_HANDOFFS}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {edges.map((edge, idx) => {
          const targetAgentId = getTargetAgentId(edge.to);
          const isExpanded = expandedIndices.has(idx);

          return (
            <React.Fragment key={idx}>
              <div className="space-y-1">
                <div className="flex h-10 items-center gap-2 rounded-md border border-border-medium bg-surface-tertiary pr-2">
                  <ControlCombobox
                    isCollapsed={false}
                    ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_select') })}
                    selectedValue={targetAgentId}
                    setValue={(id) => updateHandoffAt(idx, id)}
                    selectPlaceholder={localize('com_ui_agent_var', {
                      0: localize('com_ui_select'),
                    })}
                    searchPlaceholder={localize('com_ui_agent_var', {
                      0: localize('com_ui_search'),
                    })}
                    items={selectableAgents}
                    displayValue={getAgentDetails(targetAgentId)?.name ?? ''}
                    SelectIcon={
                      <MessageIcon
                        message={
                          {
                            endpoint: EModelEndpoint.agents,
                            isCreatedByUser: false,
                          } as TMessage
                        }
                        agent={targetAgentId && agentsMap ? agentsMap[targetAgentId] : undefined}
                      />
                    }
                    className="flex-1 border-border-heavy"
                    containerClassName="px-0"
                  />
                  <button
                    type="button"
                    className="rounded p-1 transition hover:bg-surface-hover"
                    onClick={() => toggleExpanded(idx)}
                  >
                    <ChevronDown
                      size={16}
                      className={`text-text-secondary transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    className="rounded-xl p-1 transition hover:bg-surface-hover"
                    onClick={() => removeHandoffAt(idx)}
                  >
                    <X size={18} className="text-text-secondary" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="space-y-3 rounded-md border border-border-light bg-surface-primary p-3">
                    <div>
                      <Label
                        htmlFor={`handoff-desc-${idx}`}
                        className="text-xs text-text-secondary"
                      >
                        {localize('com_ui_agent_handoff_description')}
                      </Label>
                      <Input
                        id={`handoff-desc-${idx}`}
                        placeholder={localize('com_ui_agent_handoff_description_placeholder')}
                        value={edge.description || ''}
                        onChange={(e) =>
                          updateHandoffDetailsAt(idx, { description: e.target.value })
                        }
                        className="mt-1 h-8 text-sm"
                      />
                    </div>

                    <div>
                      <Label
                        htmlFor={`handoff-prompt-${idx}`}
                        className="text-xs text-text-secondary"
                      >
                        {localize('com_ui_agent_handoff_prompt')}
                      </Label>
                      <Textarea
                        id={`handoff-prompt-${idx}`}
                        placeholder={localize('com_ui_agent_handoff_prompt_placeholder')}
                        value={typeof edge.prompt === 'string' ? edge.prompt : ''}
                        onChange={(e) => updateHandoffDetailsAt(idx, { prompt: e.target.value })}
                        className="mt-1 h-20 resize-none text-sm"
                      />
                    </div>

                    {edge.prompt && (
                      <div>
                        <Label
                          htmlFor={`handoff-promptkey-${idx}`}
                          className="text-xs text-text-secondary"
                        >
                          {localize('com_ui_agent_handoff_prompt_key')}
                        </Label>
                        <Input
                          id={`handoff-promptkey-${idx}`}
                          placeholder={localize('com_ui_agent_handoff_prompt_key_placeholder')}
                          value={edge.promptKey || ''}
                          onChange={(e) =>
                            updateHandoffDetailsAt(idx, { promptKey: e.target.value })
                          }
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {idx < edges.length - 1 && (
                <Waypoints className="mx-auto text-text-secondary" size={14} />
              )}
            </React.Fragment>
          );
        })}

        {edges.length < MAX_HANDOFFS && (
          <>
            {edges.length > 0 && <Waypoints className="mx-auto text-text-secondary" size={14} />}
            <ControlCombobox
              isCollapsed={false}
              ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
              selectedValue=""
              setValue={setNewAgentId}
              selectPlaceholder={localize('com_ui_agent_handoff_add')}
              searchPlaceholder={localize('com_ui_agent_var', { 0: localize('com_ui_search') })}
              items={selectableAgents}
              className="h-10 w-full border-dashed border-border-heavy text-center text-text-secondary hover:text-text-primary"
              containerClassName="px-0"
              SelectIcon={<PlusCircle size={16} className="text-text-secondary" />}
            />
          </>
        )}

        {edges.length >= MAX_HANDOFFS && (
          <p className="pt-1 text-center text-xs italic text-text-tertiary">
            {localize('com_ui_agent_handoff_max', { 0: MAX_HANDOFFS })}
          </p>
        )}
      </div>
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">{localize('com_ui_agent_handoff_info')}</p>
            <p className="text-sm text-text-secondary">{localize('com_ui_agent_handoff_info_2')}</p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default AgentHandoffs;
