import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm, AgentModelPanelProps } from '~/common';
import FormInput from '~/components/ui/FormInput';
import AgentChain from './AgentChain';
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
    <div className="scrollbar-gutter-stable h-full min-h-[40vh] overflow-auto pb-12 text-sm">
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
        <div className="mb-2 mt-2 text-xl font-medium">{localize('com_ui_advanced_settings')}</div>
      </div>
      <div className="flex flex-col gap-4 px-2">
        <Controller
          name="recursion_limit"
          control={control}
          render={({ field }) => (
            <FormInput
              field={field}
              containerClass="w-1/2"
              inputClass="w-full"
              label={localize('com_ui_agent_recursion_limit')}
              placeholder={localize('com_nav_theme_system')}
              type="number"
            />
          )}
        />
        <Controller
          name="agent_ids"
          control={control}
          defaultValue={[]}
          render={({ field }) => <AgentChain field={field} currentAgentId={currentAgentId} />}
        />
      </div>
    </div>
  );
}
