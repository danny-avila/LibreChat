import { Control, Controller, UseFormSetValue, UseFormGetValues } from 'react-hook-form';
import { CircleHelpIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Checkbox,
} from '~/components/ui';
import { ESide } from '~/common';
import type { AssistantForm } from '~/common';

interface AppendDateCheckboxProps {
  control: Control<AssistantForm>;
  setValue: UseFormSetValue<AssistantForm>;
  getValues: UseFormGetValues<AssistantForm>;
}

export default function AppendDateCheckbox({
  control,
  setValue,
  getValues,
}: AppendDateCheckboxProps) {
  const localize = useLocalize();

  const handleChange = (checked: boolean) => {
    setValue('append_today_date', checked, {
      shouldDirty: true,
    });
  };

  return (
    <div className="mb-6">
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name="append_today_date"
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                id="append_today_date"
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
              htmlFor="append_today_date"
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
