// client/src/components/SidePanel/Parameters/DynamicInput.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useLocalize } from '~/hooks';
import { Label, Input, HoverCard, HoverCardTrigger } from '~/components/ui';
import { cn, defaultTextProps } from '~/utils';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicInput({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  placeholder = '',
  readonly = false,
  showDefault = true,
  labelCode,
  descriptionCode,
  placeholderCode,
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
          <div className="flex w-full justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-input`}
              className="text-left text-sm font-medium"
            >
              {labelCode === true ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  {typeof defaultValue === 'undefined' ||
                  !((defaultValue as string | undefined)?.length ?? 0)
                    ? localize('com_endpoint_default_blank')
                    : `${localize('com_endpoint_default')}: ${defaultValue}`}
                </small>
              )}
            </Label>
          </div>
          <Controller
            name={settingKey}
            control={control}
            defaultValue={defaultValue as string}
            render={({ field }) => (
              <Input
                id={`${settingKey}-dynamic-input`}
                disabled={readonly}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={
                  placeholderCode === true ? localize(placeholder) ?? placeholder : placeholder
                }
                className={cn(defaultTextProps, 'flex h-10 max-h-10 w-full resize-none px-3 py-2')}
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

export default DynamicInput;
