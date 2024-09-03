// client/src/components/SidePanel/Parameters/DynamicSlider.tsx
import React, { useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, Slider, HoverCard, Input, InputNumber, HoverCardTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps, optionText } from '~/utils';
import { ESide } from '~/common';
import OptionHover from './OptionHover';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicSlider({
  label = '',
  settingKey,
  defaultValue,
  range,
  description = '',
  columnSpan,
  options,
  readonly = false,
  showDefault = true,
  includeInput = true,
  labelCode,
  descriptionCode,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { control } = useFormContext();

  const isEnum = useMemo(
    () => (!range && options && options.length > 0) ?? false,
    [options, range],
  );

  const enumToNumeric = useMemo(() => {
    if (isEnum && options) {
      return options.reduce((acc, mapping, index) => {
        acc[mapping] = index;
        return acc;
      }, {} as Record<string, number | undefined>);
    }
    return {};
  }, [isEnum, options]);

  const valueToEnumOption = useMemo(() => {
    if (isEnum && options) {
      return options.reduce((acc, option, index) => {
        acc[index] = option;
        return acc;
      }, {} as Record<number, string>);
    }
    return {};
  }, [isEnum, options]);

  const max = useMemo(() => {
    if (isEnum && options) {
      return options.length - 1;
    } else if (range) {
      return range.max;
    } else {
      return 0;
    }
  }, [isEnum, options, range]);

  if (!range && !isEnum) {
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
              defaultValue={defaultValue as number | string}
              render={({ field }) => (
                <>
                  {includeInput && !isEnum ? (
                    <InputNumber
                      id={`${settingKey}-dynamic-setting-input-number`}
                      disabled={readonly}
                      value={field.value as number}
                      onChange={(value) => field.onChange(Number(value))}
                      max={range ? range.max : (options?.length ?? 0) - 1}
                      min={range ? range.min : 0}
                      step={range ? range.step ?? 1 : 1}
                      controls={false}
                      className={cn(
                        defaultTextProps,
                        optionText,
                        'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                      )}
                    />
                  ) : (
                    <Input
                      id={`${settingKey}-dynamic-setting-input`}
                      disabled={readonly}
                      value={field.value as string}
                      onChange={() => ({})}
                      className={cn(
                        defaultTextProps,
                        optionText,
                        'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                      )}
                    />
                  )}
                  <Slider
                    id={`${settingKey}-dynamic-setting-slider`}
                    disabled={readonly}
                    value={[
                      isEnum ? enumToNumeric[field.value as string] ?? 0 : (field.value as number),
                    ]}
                    onValueChange={(value) =>
                      field.onChange(isEnum ? valueToEnumOption[value[0]] : value[0])
                    }
                    max={max}
                    min={range ? range.min : 0}
                    step={range ? range.step ?? 1 : 1}
                    className="flex h-4 w-full"
                  />
                </>
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

export default DynamicSlider;
