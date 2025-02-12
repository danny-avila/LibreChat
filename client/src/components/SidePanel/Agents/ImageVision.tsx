import { useFormContext, Controller } from 'react-hook-form';
import { Capabilities } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { Checkbox } from '~/components/ui';
import { useLocalize } from '~/hooks';

export default function ImageVision() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;

  return (
    <div className="flex items-center">
      <Controller
        name={Capabilities.image_vision}
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
      <label
        className="form-check-label text-token-text-primary w-full cursor-pointer"
        htmlFor={Capabilities.image_vision}
        onClick={() =>
          setValue(Capabilities.image_vision, !getValues(Capabilities.image_vision), {
            shouldDirty: true,
          })
        }
      >
        <div className="flex items-center">{localize('com_assistants_image_vision')}</div>
      </label>
    </div>
  );
}
