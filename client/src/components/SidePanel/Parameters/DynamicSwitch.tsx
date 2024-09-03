// client/src/components/SidePanel/Parameters/DynamicSwitch.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, Switch, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicSwitch({
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
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-switch`}
              className="text-left text-sm font-medium"
            >
              {labelCode === true ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}:{' '}
                  {defaultValue != null ? localize('com_ui_on') : localize('com_ui_off')})
                </small>
              )}
            </Label>
          </div>
          <Controller
            name={settingKey}
            control={control}
            defaultValue={defaultValue as boolean}
            render={({ field }) => (
              <Switch
                id={`${settingKey}-dynamic-switch`}
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={readonly}
                className="flex"
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

export default DynamicSwitch;
