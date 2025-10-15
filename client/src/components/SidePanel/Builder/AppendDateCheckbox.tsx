import { Control, Controller, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import {
  CircleHelpIcon,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Checkbox,
} from '@librechat/client';
import type { AssistantForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

interface AppendDateCheckboxProps {
  control: Control<AssistantForm>;
  setValue: UseFormSetValue<AssistantForm>;
  getValues: UseFormGetValues<AssistantForm>;
}

export default function AppendDateCheckbox({ control, setValue }: AppendDateCheckboxProps) {
  const localize = useLocalize();

  const handleChange = (checked: boolean) => {
    setValue('append_current_datetime', checked, {
      shouldDirty: true,
    });
  };

  return (
    <div className="mb-6">
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name="append_current_datetime"
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                id="append_current_datetime"
                checked={field.value}
                onCheckedChange={handleChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                aria-labelledby="append-date-label"
              />
            )}
          />
          <div className="flex items-center space-x-2">
            <label
              id="append-date-label"
              htmlFor="append_current_datetime"
              className="form-check-label text-token-text-primary w-full cursor-pointer"
            >
              {localize('com_assistants_append_date')}
            </label>
            <HoverCardTrigger>
              <CircleHelpIcon
                className="h-5 w-5 text-gray-500"
                aria-label={localize('com_assistants_append_date_tooltip')}
              />
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {localize('com_assistants_append_date_tooltip')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
    </div>
  );
}
