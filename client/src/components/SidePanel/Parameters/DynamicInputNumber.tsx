// client/src/components/SidePanel/Parameters/DynamicInputNumber.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, HoverCard, InputNumber, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps, optionText } from '~/utils';
import { ESide } from '~/common';
import OptionHover from './OptionHover';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicInputNumber({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  readonly = false,
  showDefault = true,
  labelCode,
  descriptionCode,
  placeholderCode,
  placeholder = '',
  range,
  className = '',
  inputClassName = '',
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { control } = useFormContext();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start gap-6',
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full',
        className,
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-setting`}
              className="text-left text-sm font-medium"
            >
              {labelCode === true ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {defaultValue})
                </small>
              )}
            </Label>
            <Controller
              name={settingKey}
              control={control}
              defaultValue={defaultValue as number}
              render={({ field }) => (
                <InputNumber
                  id={`${settingKey}-dynamic-setting-input-number`}
                  disabled={readonly}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  min={range?.min}
                  max={range?.max}
                  step={range?.step}
                  placeholder={
                    placeholderCode === true ? localize(placeholder) ?? placeholder : placeholder
                  }
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    optionText,
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    inputClassName,
                  )}
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

export default DynamicInputNumber;
