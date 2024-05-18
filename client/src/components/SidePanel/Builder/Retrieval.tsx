import { useEffect, useMemo } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { Capabilities } from 'librechat-data-provider';
import type { AssistantsEndpoint } from 'librechat-data-provider';
import type { AssistantForm } from '~/common';
import OptionHover from '~/components/SidePanel/Parameters/OptionHover';
import { Checkbox, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';
import { cn } from '~/utils/';

export default function Retrieval({
  version,
  retrievalModels,
}: {
  version: number | string;
  retrievalModels: Set<string>;
  endpoint: AssistantsEndpoint;
}) {
  const localize = useLocalize();
  const methods = useFormContext<AssistantForm>();
  const { control, setValue, getValues } = methods;
  const model = useWatch({ control, name: 'model' });
  const assistant = useWatch({ control, name: 'assistant' });

  const vectorStores = useMemo(() => {
    if (typeof assistant === 'string') {
      return [];
    }
    return assistant.tool_resources?.file_search;
  }, [assistant]);

  const isDisabled = useMemo(() => !retrievalModels.has(model), [model, retrievalModels]);

  useEffect(() => {
    if (model && isDisabled) {
      setValue(Capabilities.retrieval, false);
    }
  }, [model, setValue, isDisabled]);

  return (
    <>
      <div className="flex items-center">
        <Controller
          name={Capabilities.retrieval}
          control={control}
          render={({ field }) => (
            <Checkbox
              {...field}
              checked={field.value}
              disabled={isDisabled}
              onCheckedChange={field.onChange}
              className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
              value={field?.value?.toString()}
            />
          )}
        />
        <HoverCard openDelay={50}>
          <HoverCardTrigger asChild>
            <label
              className={cn(
                'form-check-label text-token-text-primary w-full select-none',
                isDisabled ? 'cursor-no-drop opacity-50' : 'cursor-pointer',
              )}
              htmlFor={Capabilities.retrieval}
              onClick={() =>
                retrievalModels.has(model) &&
                setValue(Capabilities.retrieval, !getValues(Capabilities.retrieval), {
                  shouldDirty: true,
                })
              }
            >
              {version == 1
                ? localize('com_assistants_retrieval')
                : localize('com_assistants_file_search')}
            </label>
          </HoverCardTrigger>
          <OptionHover
            side={ESide.Top}
            disabled={!isDisabled}
            description="com_assistants_non_retrieval_model"
            langCode={true}
            sideOffset={20}
          />
        </HoverCard>
      </div>
      {version == 2 && (
        <div className="text-token-text-tertiary rounded-lg text-xs">
          {localize('com_assistants_file_search_info')}
        </div>
      )}
    </>
  );
}
