import React, { useState, useMemo, useEffect } from 'react';
import { Waypoints, ChevronDown } from 'lucide-react';
import { Label, Input, Textarea } from '@librechat/client';
import type { ControllerRenderProps } from 'react-hook-form';
import type { GraphEdge } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import {
  AgentRow,
  agentIcon,
  AddAgentSelect,
  AgentSelectInline,
  useSelectableAgents,
} from './AgentList';
import OrchestrationPattern from './OrchestrationPattern';
import { useLocalize } from '~/hooks';
import { CountPill } from './ui';

interface AgentHandoffsProps {
  field: ControllerRenderProps<AgentForm, 'edges'>;
  currentAgentId: string;
}

/** TODO: make configurable */
const MAX_HANDOFFS = 10;

const Connector = () => (
  <Waypoints className="mx-auto text-text-tertiary" size={14} aria-hidden="true" />
);

const getTargetAgentId = (to: string | string[]): string => (Array.isArray(to) ? to[0] : to);

const AgentHandoffs: React.FC<AgentHandoffsProps> = ({ field, currentAgentId }) => {
  const localize = useLocalize();
  const [newAgentId, setNewAgentId] = useState('');
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const edges = useMemo(() => field.value ?? [], [field.value]);

  const { options, getAgent } = useSelectableAgents({ currentAgentId });

  useEffect(() => {
    if (newAgentId && edges.length < MAX_HANDOFFS) {
      const newEdge: GraphEdge = { from: currentAgentId, to: newAgentId, edgeType: 'handoff' };
      field.onChange([...edges, newEdge]);
      setNewAgentId('');
    }
  }, [newAgentId, edges, field, currentAgentId]);

  const removeHandoffAt = (index: number) => {
    field.onChange(edges.filter((_, i) => i !== index));
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
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
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <OrchestrationPattern
      icon={<Waypoints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
      title={localize('com_ui_agent_handoffs')}
      subtitle={localize('com_ui_agent_handoffs_subtitle')}
      beta
      info={
        <>
          <p className="text-sm text-text-secondary">{localize('com_ui_agent_handoff_info')}</p>
          <p className="text-sm text-text-secondary">{localize('com_ui_agent_handoff_info_2')}</p>
        </>
      }
      trailing={
        <CountPill>
          {edges.length} / {MAX_HANDOFFS}
        </CountPill>
      }
    >
      <div className="flex flex-col gap-1.5">
        {edges.map((edge, idx) => {
          const targetAgentId = getTargetAgentId(edge.to);
          const isExpanded = expandedIndices.has(idx);
          const targetName = getAgent(targetAgentId)?.name ?? localize('com_ui_agent');

          return (
            <React.Fragment key={idx}>
              {idx > 0 && <Connector />}
              <div className="flex flex-col gap-1.5">
                <AgentRow
                  onRemove={() => removeHandoffAt(idx)}
                  removeLabel={localize('com_ui_agent_handoff_remove', { 0: targetName })}
                >
                  <AgentSelectInline
                    options={options}
                    selectedValue={targetAgentId}
                    onChange={(id) => updateHandoffAt(idx, id)}
                    displayValue={getAgent(targetAgentId)?.name ?? ''}
                    icon={agentIcon(getAgent(targetAgentId))}
                    ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_select') })}
                  />
                  <button
                    type="button"
                    className="flex-shrink-0 rounded-lg p-1 text-text-secondary transition hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                    onClick={() => toggleExpanded(idx)}
                    aria-expanded={isExpanded}
                    aria-label={localize(isExpanded ? 'com_ui_collapse' : 'com_ui_expand')}
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </AgentRow>

                {isExpanded && (
                  <div className="ml-1.5 flex flex-col gap-2.5 border-l border-border-light pl-3">
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
                          updateHandoffDetailsAt(idx, {
                            description: e.target.value === '' ? undefined : e.target.value,
                          })
                        }
                        className="mt-1 h-9 text-sm"
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
                        onChange={(e) =>
                          updateHandoffDetailsAt(idx, {
                            prompt: e.target.value === '' ? undefined : e.target.value,
                          })
                        }
                        className="mt-1 h-16 resize-none text-sm"
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
                            updateHandoffDetailsAt(idx, {
                              promptKey: e.target.value === '' ? undefined : e.target.value,
                            })
                          }
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {edges.length < MAX_HANDOFFS && (
          <>
            {edges.length > 0 && <Connector />}
            <AddAgentSelect
              options={options}
              onSelect={setNewAgentId}
              placeholder={localize('com_ui_agent_handoff_add')}
              ariaLabel={localize('com_ui_agent_var', { 0: localize('com_ui_add') })}
            />
          </>
        )}

        {edges.length >= MAX_HANDOFFS && (
          <p className="pt-1 text-center text-xs italic text-text-tertiary">
            {localize('com_ui_agent_handoff_max', { 0: MAX_HANDOFFS })}
          </p>
        )}
      </div>
    </OrchestrationPattern>
  );
};

export default AgentHandoffs;
