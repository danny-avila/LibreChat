import { useEffect, useMemo } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { Capabilities } from 'librechat-data-provider';
import type { AssistantsEndpoint } from 'librechat-data-provider';
import type { AssistantForm } from '~/common';
import { Checkbox } from '~/components/ui';
import { useLocalize } from '~/hooks';
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

  const files = useMemo(() => {
    if (typeof assistant === 'string') {
      return [];
    }
    return assistant.tool_resources?.file_search;
  }, [assistant]);

  useEffect(() => {
    if (model && !retrievalModels.has(model)) {
      setValue(Capabilities.retrieval, false);
    }
  }, [model, setValue, retrievalModels]);

  return (
    <div className="flex items-center">
      <Controller
        name={Capabilities.retrieval}
        control={control}
        render={({ field }) => (
          <Checkbox
            {...field}
            checked={field.value}
            disabled={!retrievalModels.has(model)}
            onCheckedChange={field.onChange}
            className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
            value={field?.value?.toString()}
          />
        )}
      />
      <label
        className={cn(
          'form-check-label text-token-text-primary w-full',
          !retrievalModels.has(model) ? 'cursor-no-drop opacity-50' : 'cursor-pointer',
        )}
        htmlFor={Capabilities.retrieval}
        onClick={() =>
          retrievalModels.has(model) &&
          setValue(Capabilities.retrieval, !getValues(Capabilities.retrieval), {
            shouldDirty: true,
          })
        }
      >
        {localize('com_assistants_retrieval')}
      </label>
    </div>
  );
}
