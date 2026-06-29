import { memo } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import {
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

function Memory() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control } = methods;

  return (
    <HoverCard openDelay={50}>
      <div className="my-2 flex items-center">
        <Controller
          name={AgentCapabilities.memory}
          control={control}
          render={({ field }) => (
            <Checkbox
              {...field}
              id="memory-checkbox"
              checked={field.value === true}
              onCheckedChange={field.onChange}
              className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
              value={(field.value === true).toString()}
              aria-labelledby="memory-label"
            />
          )}
        />
        <label
          id="memory-label"
          htmlFor="memory-checkbox"
          className="form-check-label text-token-text-primary cursor-pointer text-sm"
        >
          {localize('com_agents_enable_memory')}
        </label>
        <HoverCardTrigger asChild className="ml-2">
          <button
            type="button"
            className="inline-flex items-center"
            aria-label={localize('com_agents_memory_info')}
          >
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </button>
        </HoverCardTrigger>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">{localize('com_agents_memory_info')}</p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
      </div>
    </HoverCard>
  );
}

export default memo(Memory);
