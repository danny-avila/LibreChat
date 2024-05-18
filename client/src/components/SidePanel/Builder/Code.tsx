import { useMemo } from 'react';
import { Capabilities } from 'librechat-data-provider';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import type { AssistantsEndpoint } from 'librechat-data-provider';
import type { AssistantForm } from '~/common';
import { Checkbox, QuestionMark } from '~/components/ui';
import { useLocalize } from '~/hooks';
import CodeFiles from './CodeFiles';

export default function Code({
  version,
  endpoint,
}: {
  version: number | string;
  endpoint: AssistantsEndpoint;
}) {
  const localize = useLocalize();
  const methods = useFormContext<AssistantForm>();
  const { control, setValue, getValues } = methods;
  const assistant = useWatch({ control, name: 'assistant' });
  const assistant_id = useWatch({ control, name: 'id' });
  const files = useMemo(() => {
    if (typeof assistant === 'string') {
      return [];
    }
    return assistant.code_files;
  }, [assistant]);

  return (
    <>
      <div className="flex items-center">
        <Controller
          name={Capabilities.code_interpreter}
          control={control}
          render={({ field }) => (
            <Checkbox
              {...field}
              checked={field.value}
              onCheckedChange={field.onChange}
              className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
              value={field?.value?.toString()}
            />
          )}
        />
        <label
          className="form-check-label text-token-text-primary w-full cursor-pointer"
          htmlFor={Capabilities.code_interpreter}
          onClick={() =>
            setValue(Capabilities.code_interpreter, !getValues(Capabilities.code_interpreter), {
              shouldDirty: true,
            })
          }
        >
          <div className="flex select-none items-center">
            {localize('com_assistants_code_interpreter')}
            <QuestionMark />
          </div>
        </label>
      </div>
      {version == 2 && (
        <CodeFiles
          assistant_id={assistant_id}
          version={version}
          endpoint={endpoint}
          files={files}
        />
      )}
    </>
  );
}
