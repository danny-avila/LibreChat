// client/src/components/SidePanel/Parameters/DynamicDropdown.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, HoverCard, HoverCardTrigger, SelectDropDown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import { cn } from '~/utils';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicDropdown({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  options,
  readonly = false,
  showDefault = true,
  labelCode,
  descriptionCode,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { control } = useFormContext();

  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start gap-6',
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full',
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex w-full justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-dropdown`}
              className="text-left text-sm font-medium"
            >
              {labelCode === true ? localize(label) ?? label : label || settingKey}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {defaultValue})
                </small>
              )}
            </Label>
          </div>
          <Controller
            name={settingKey}
            control={control}
            defaultValue={defaultValue as string}
            render={({ field }) => (
              <SelectDropDown
                showLabel={false}
                emptyTitle={true}
                disabled={readonly}
                value={field.value}
                setValue={field.onChange}
                availableValues={options}
                containerClassName="w-full"
                id={`${settingKey}-dynamic-dropdown`}
              />
            )}
          />
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

export default DynamicDropdown;
