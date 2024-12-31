import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  Checkbox,
  HoverCard,
  // HoverCardContent,
  // HoverCardPortal,
  // HoverCardTrigger,
} from '~/components/ui';
// import { CircleHelpIcon } from '~/components/svg';
// import { useLocalize } from '~/hooks';
// import { ESide } from '~/common';

export default function HideSequential() {
  // const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="my-2 flex items-center">
          <Controller
            name={AgentCapabilities.hide_sequential_outputs}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                checked={field.value}
                onCheckedChange={field.onChange}
                className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value?.toString()}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() =>
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
              setValue(
                AgentCapabilities.hide_sequential_outputs,
                !getValues(AgentCapabilities.hide_sequential_outputs),
                {
                  shouldDirty: true,
                },
              )
            }
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.hide_sequential_outputs}
            >
              Hide Sequential Agent Outputs except the last agent&apos;s
            </label>
            {/* <HoverCardTrigger>
              <CircleHelpIcon className="h-5 w-5 text-gray-500" />
            </HoverCardTrigger> */}
          </button>
          {/* <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_ttg_info')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal> */}
        </div>
      </HoverCard>
    </>
  );
}
