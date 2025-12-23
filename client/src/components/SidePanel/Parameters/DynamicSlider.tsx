import { useMemo, useCallback } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Slider, HoverCard, Input, InputNumber, HoverCardTrigger } from '@librechat/client';
import { useLocalize, useDebouncedInput, useParameterEffects, TranslationKeys } from '~/hooks';
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
  enumMappings,
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
    optionKey: settingKey,
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
      return options.reduce(
        (acc, mapping, index) => {
          acc[mapping] = index;
          return acc;
        },
        {} as Record<string, number>,
      );
    }
    return {};
  }, [isEnum, options]);

  const valueToEnumOption = useMemo(() => {
    if (isEnum && options) {
      return options.reduce(
        (acc, option, index) => {
          acc[index] = option;
          return acc;
        },
        {} as Record<number, string>,
      );
    }
    return {};
  }, [isEnum, options]);

  const getDisplayValue = useCallback(
    (value: string | number | undefined | null): string => {
      if (isEnum && enumMappings && value != null) {
        const stringValue = String(value);
        // Check if the value exists in enumMappings
        if (stringValue in enumMappings) {
          const mappedValue = String(enumMappings[stringValue]);
          // Check if the mapped value is a localization key
          if (mappedValue.startsWith('com_')) {
            return localize(mappedValue as TranslationKeys) ?? mappedValue;
          }
          return mappedValue;
        }
      }
      // Always return a string for Input component compatibility
      if (value != null) {
        return String(value);
      }
      return String(defaultValue ?? '');
    },
    [isEnum, enumMappings, defaultValue, localize],
  );

  const getDefaultDisplayValue = useCallback((): string => {
    if (defaultValue != null && enumMappings) {
      const stringDefault = String(defaultValue);
      if (stringDefault in enumMappings) {
        const mappedValue = String(enumMappings[stringDefault]);
        // Check if the mapped value is a localization key
        if (mappedValue.startsWith('com_')) {
          return localize(mappedValue as TranslationKeys) ?? mappedValue;
        }
        return mappedValue;
      }
    }
    return String(defaultValue ?? '');
  }, [defaultValue, enumMappings, localize]);

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
              className="break-words text-left text-sm font-medium"
            >
              {labelCode ? (localize(label as TranslationKeys) ?? label) : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}: {getDefaultDisplayValue()})
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
                step={range ? (range.step ?? 1) : 1}
                controls={false}
                aria-label={localize(label as TranslationKeys)}
                className={cn(
                  defaultTextProps,
                  cn(
                    optionText,
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 py-1 text-xs group-hover/temp:border-gray-200',
                  ),
                )}
              />
            ) : (
              <Input
                id={`${settingKey}-dynamic-setting-input`}
                disabled={readonly}
                value={getDisplayValue(selectedValue)}
                aria-label={localize(label as TranslationKeys)}
                onChange={() => ({})}
                className={cn(
                  defaultTextProps,
                  cn(
                    optionText,
                    'reset-rc-number-input h-auto w-14 border-0 py-1 pl-1 text-center text-xs group-hover/temp:border-gray-200',
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
                : ((inputValue as number) ?? (defaultValue as number)),
            ]}
            onValueChange={(value) => handleValueChange(value[0])}
            onDoubleClick={() => setInputValue(defaultValue as string | number)}
            max={max}
            aria-label={localize(label as TranslationKeys)}
            min={range ? range.min : 0}
            step={range ? (range.step ?? 1) : 1}
            className="flex h-4 w-full"
          />
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={
              descriptionCode
                ? (localize(description as TranslationKeys) ?? description)
                : description
            }
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicSlider;
