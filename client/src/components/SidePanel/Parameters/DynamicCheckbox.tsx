// client/src/components/SidePanel/Parameters/DynamicCheckbox.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, Checkbox, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicCheckbox({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  readonly = false,
  showDefault = true,
  labelCode,
  descriptionCode,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { control } = useFormContext();

  return (
    <div
      className={`flex flex-col items-center justify-start gap-6 ${
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full'
      }`}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center">
          <div className="flex justify-start gap-4">
            <Label
              htmlFor={`${settingKey}-dynamic-checkbox`}
              className="text-left text-sm font-medium"
            >
              {labelCode === true ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}:{' '}
                  {defaultValue != null ? localize('com_ui_yes') : localize('com_ui_no')})
                </small>
              )}
            </Label>
            <Controller
              name={settingKey}
              control={control}
              defaultValue={defaultValue as boolean}
              render={({ field }) => (
                <Checkbox
                  id={`${settingKey}-dynamic-checkbox`}
                  disabled={readonly}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-[2px] focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
                />
              )}
            />
          </div>
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={
              descriptionCode === true ? localize(description) ?? description : description
            }
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicCheckbox;
