// client/src/components/SidePanel/Parameters/DynamicTextarea.tsx
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, TextareaAutosize, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps } from '~/utils';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicTextarea({
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
              htmlFor={`${settingKey}-dynamic-textarea`}
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
              <TextareaAutosize
                id={`${settingKey}-dynamic-textarea`}
                disabled={readonly}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={
                  placeholderCode === true ? localize(placeholder) ?? placeholder : placeholder
                }
                className={cn(
                  defaultTextProps,
                  'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2',
                )}
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

export default DynamicTextarea;
