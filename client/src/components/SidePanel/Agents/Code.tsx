import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '~/components/ui';
import { CircleHelpIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

export default function Code() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name={AgentCapabilities.execute_code}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                checked={field.value}
                onCheckedChange={field.onChange}
                className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value != null ? field.value.toString() : 'false'}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() =>
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
              setValue(AgentCapabilities.execute_code, !getValues(AgentCapabilities.execute_code), {
                shouldDirty: true,
              })
            }
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.execute_code}
            >
              {localize('com_agents_execute_code')}
            </label>
            <HoverCardTrigger>
              <CircleHelpIcon className="h-5 w-5 text-gray-500" />
            </HoverCardTrigger>
          </button>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {/* // TODO: add a Code Interpreter description */}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
    </>
  );
}
