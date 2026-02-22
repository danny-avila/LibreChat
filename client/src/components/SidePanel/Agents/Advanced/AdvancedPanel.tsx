import { useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useAgentPanelContext } from '~/Providers';
import MaxAgentSteps from './MaxAgentSteps';
import AgentHandoffs from './AgentHandoffs';
import { useLocalize } from '~/hooks';
import AgentChain from './AgentChain';
import { Panel } from '~/common';

export default function AdvancedPanel() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, watch } = methods;
  const currentAgentId = watch('id');

  const { agentsConfig, setActivePanel } = useAgentPanelContext();
  const chainEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.chain) ?? false,
    [agentsConfig],
  );

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[40vh] overflow-auto pb-12 text-sm">
      <div className="advanced-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-0 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
            aria-label={localize('com_ui_back_to_builder')}
          >
            <div className="advanced-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft aria-hidden="true" />
            </div>
          </button>
        </div>
        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_advanced_settings')}</div>
      </div>
      <div className="flex flex-col gap-4 px-2">
        <MaxAgentSteps />
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
    </div>
  );
}
