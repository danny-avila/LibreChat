import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ToggleSetting } from './ui';

export default function EagerExecution() {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();

  return (
    <Controller
      name="eager_execution"
      control={control}
      render={({ field }) => (
        <ToggleSetting
          id="eager_execution"
          label={localize('com_ui_agent_eager_execution')}
          checked={field.value !== false}
          onCheckedChange={field.onChange}
          info={localize('com_ui_agent_eager_execution_info')}
        />
      )}
    />
  );
}
