import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ToggleSetting } from './ui';

const id = 'skills_enabled_killswitch';

export default function SkillsToggle() {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();

  return (
    <Controller
      name="skills_enabled"
      control={control}
      render={({ field }) => (
        <ToggleSetting
          id={id}
          label={localize('com_ui_tools_skills_enabled_kill_switch')}
          checked={field.value === true}
          onCheckedChange={(value) => field.onChange(Boolean(value))}
          info={
            <p className="text-sm text-text-secondary">
              {localize('com_ui_tools_skills_enabled_kill_switch_hint')}
            </p>
          }
        />
      )}
    />
  );
}
