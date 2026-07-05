import { useMemo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useAgentPanelContext } from '~/Providers';
import AgentSubagents from './AgentSubagents';
import AgentHandoffs from './AgentHandoffs';
import { groupHeadingClass } from './ui';
import AgentChain from './AgentChain';
import { useLocalize } from '~/hooks';

interface OrchestrationHubProps {
  currentAgentId: string;
}

/**
 * Unifies the multi-agent collaboration patterns (delegate / hand off / chain)
 * into a single hub with one shared visual language. Each pattern is gated by
 * the agent endpoint's enabled capabilities; handoffs are always available.
 */
export default function OrchestrationHub({ currentAgentId }: OrchestrationHubProps) {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();
  const { agentsConfig } = useAgentPanelContext();

  const subagentsEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.subagents) ?? false,
    [agentsConfig],
  );
  const chainEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.chain) ?? false,
    [agentsConfig],
  );

  return (
    <section className="flex flex-col gap-1">
      <div className="flex flex-col gap-0.5">
        <span className={groupHeadingClass}>{localize('com_ui_agent_orchestration')}</span>
        <p className="text-xs text-text-secondary">{localize('com_ui_agent_orchestration_hint')}</p>
      </div>
      <div className="divide-y divide-border-light">
        {subagentsEnabled && (
          <Controller
            name="subagents"
            control={control}
            render={({ field }) => <AgentSubagents field={field} currentAgentId={currentAgentId} />}
          />
        )}
        <Controller
          name="edges"
          control={control}
          defaultValue={[]}
          render={({ field }) => <AgentHandoffs field={field} currentAgentId={currentAgentId} />}
        />
        {chainEnabled && (
          <Controller
            name="agent_ids"
            control={control}
            defaultValue={[]}
            render={({ field }) => <AgentChain field={field} currentAgentId={currentAgentId} />}
          />
        )}
      </div>
    </section>
  );
}
