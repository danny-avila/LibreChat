import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  HoverCard,
  FormInput,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui';
import { CircleHelpIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

export default function AdvancedPanel() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;

  return (
    <HoverCard openDelay={50}>
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
            labelAdjacent={
              <HoverCardTrigger>
                <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
              </HoverCardTrigger>
            }
          />
        )}
      />
      <HoverCardPortal>
        <HoverCardContent side={ESide.Top} className="w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">
              {localize('com_ui_agent_recursion_limit_info')}
            </p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
}
