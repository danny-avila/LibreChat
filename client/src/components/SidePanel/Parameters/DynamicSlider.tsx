import { useMemo, useCallback } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Slider, HoverCard, Input, InputNumber, HoverCardTrigger } from '~/components/ui';
import { useLocalize, useDebouncedInput, useParameterEffects } from '~/hooks';
import { cn, defaultTextProps, optionText } from '~/utils';
import { ESide, defaultDebouncedDelay } from '~/common';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';

function DynamicSlider({
  label = '',
  settingKey,
  defaultValue,
  range,
  description = '',
  columnSpan,
  setOption,
  optionType,
  options,
  readonly = false,
  showDefault = false,
  includeInput = true,
  labelCode = false,
  descriptionCode = false,
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();
  const isEnum = useMemo(
    () => (!range && options && options.length > 0) ?? false,
    [options, range],
  );

  const [setInputValue, inputValue, setLocalValue] = useDebouncedInput<string | number>({
    optionKey: optionType !== OptionTypes.Custom ? settingKey : undefined,
    initialValue: optionType !== OptionTypes.Custom ? conversation?.[settingKey] : defaultValue,
    setter: () => ({}),
    setOption,
    delay: isEnum ? 0 : defaultDebouncedDelay,
  });

  useParameterEffects({
    preset,
    settingKey,
    defaultValue,
    conversation,
    inputValue,
    setInputValue: setLocalValue,
    preventDelayedUpdate: isEnum,
  });

  const selectedValue = useMemo(() => {
    if (isEnum) {
      return conversation?.[settingKey] ?? defaultValue;
    }
    // TODO: custom logic, add to payload but not to conversation

    return inputValue;
  }, [conversation, defaultValue, settingKey, inputValue, isEnum]);

  const enumToNumeric = useMemo(() => {
    if (isEnum && options) {
      return options.reduce((acc, mapping, index) => {
        acc[mapping] = index;
        return acc;
      }, {} as Record<string, number>);
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

  const handleValueChange = useCallback(
    (value: number) => {
      if (isEnum) {
        setInputValue(valueToEnumOption[value]);
      } else {
        setInputValue(value);
      }
    },
    [isEnum, setInputValue, valueToEnumOption],
  );

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
        'flex flex-col items-center justify-start gap-2',
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full',
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex w-full items-center justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-setting`}
              className="text-left text-sm font-medium"
            >
              {labelCode ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {defaultValue})
                </small>
              )}
            </Label>
            {includeInput && !isEnum ? (
              <InputNumber
                id={`${settingKey}-dynamic-setting-input-number`}
                disabled={readonly}
                value={inputValue ?? defaultValue}
                onChange={(value) => setInputValue(Number(value))}
                max={range ? range.max : (options?.length ?? 0) - 1}
                min={range ? range.min : 0}
                step={range ? range.step ?? 1 : 1}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    optionText,
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                  ),
                )}
              />
            ) : (
              <Input
                id={`${settingKey}-dynamic-setting-input`}
                disabled={readonly}
                value={selectedValue ?? defaultValue}
                onChange={() => ({})}
                className={cn(
                  defaultTextProps,
                  cn(
                    optionText,
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                  ),
                )}
              />
            )}
          </div>
          <Slider
            id={`${settingKey}-dynamic-setting-slider`}
            disabled={readonly}
            value={[
              isEnum
                ? enumToNumeric[(selectedValue as number) ?? '']
                : (inputValue as number) ?? (defaultValue as number),
            ]}
            onValueChange={(value) => handleValueChange(value[0])}
            doubleClickHandler={() => setInputValue(defaultValue as string | number)}
            max={max}
            min={range ? range.min : 0}
            step={range ? range.step ?? 1 : 1}
            className="flex h-4 w-full"
            trackClassName="bg-surface-hover"
          />
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={descriptionCode ? localize(description) ?? description : description}
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicSlider;
