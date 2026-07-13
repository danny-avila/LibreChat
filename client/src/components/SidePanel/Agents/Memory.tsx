import { memo } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { MemoryScope, AgentCapabilities } from 'librechat-data-provider';
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
  const memoryEnabled = useWatch({ control, name: AgentCapabilities.memory });

  return (
    <div>
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
      {memoryEnabled === true && (
        <HoverCard openDelay={50}>
          <div className="my-2 ml-6 flex items-center">
            <Controller
              name="memory_scope"
              control={control}
              render={({ field }) => (
                <Checkbox
                  {...field}
                  id="memory-scope-checkbox"
                  checked={field.value === MemoryScope.agent}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true ? MemoryScope.agent : MemoryScope.user)
                  }
                  className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                  value={(field.value === MemoryScope.agent).toString()}
                  aria-labelledby="memory-scope-label"
                />
              )}
            />
            <label
              id="memory-scope-label"
              htmlFor="memory-scope-checkbox"
              className="form-check-label text-token-text-primary cursor-pointer text-sm"
            >
              {localize('com_agents_memory_scope')}
            </label>
            <HoverCardTrigger asChild className="ml-2">
              <button
                type="button"
                className="inline-flex items-center"
                aria-label={localize('com_agents_memory_scope_info')}
              >
                <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
              </button>
            </HoverCardTrigger>
            <HoverCardPortal>
              <HoverCardContent side={ESide.Top} className="w-80">
                <div className="space-y-2">
                  <p className="text-sm text-text-secondary">
                    {localize('com_agents_memory_scope_info')}
                  </p>
                </div>
              </HoverCardContent>
            </HoverCardPortal>
          </div>
        </HoverCard>
      )}
    </div>
  );
}

export default memo(Memory);
