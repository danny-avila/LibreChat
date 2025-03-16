import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm, AgentModelPanelProps } from '~/common';
import SequentialAgents from './Sequential/SequentialAgents';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

export default function AdvancedPanel({
  setActivePanel,
}: Pick<AgentModelPanelProps, 'setActivePanel'>) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, watch } = methods;
  const currentAgentId = watch('id');

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[50vh] overflow-auto pb-12 text-sm">
      <div className="advanced-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-0 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
          >
            <div className="advanced-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>

        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_advanced')}</div>
      </div>
      <Controller
        name="agent_ids"
        control={control}
        defaultValue={[]}
        render={({ field }) => <SequentialAgents field={field} currentAgentId={currentAgentId} />}
      />
    </div>
  );
}
