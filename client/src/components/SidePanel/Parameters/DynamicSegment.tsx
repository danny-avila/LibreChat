import { useMemo, useState } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, HoverCard, HoverCardTrigger, SegmentedControl } from '~/components/ui';
import { TranslationKeys, useLocalize, useParameterEffects } from '~/hooks';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import { cn } from '~/utils';

function DynamicSegment({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  setOption,
  optionType,
  options,
  enumMappings,
  readonly = false,
  showLabel = true,
  showDefault = false,
  labelCode = false,
  descriptionCode = false,
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();
  const [inputValue, setInputValue] = useState<string | null>(null);

  const selectedValue = useMemo(() => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      return inputValue;
    }

    return conversation?.[settingKey] ?? defaultValue;
  }, [conversation, defaultValue, optionType, settingKey, inputValue]);

  const handleChange = (value: string) => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      setInputValue(value);
      return;
    }
    setOption(settingKey)(value);
  };

  useParameterEffects({
    preset,
    settingKey,
    defaultValue,
    conversation,
    inputValue,
    setInputValue,
    preventDelayedUpdate: true,
  });

  if (!options || options.length === 0) {
    return null;
  }

  // Convert options to SegmentedControl format with proper localization
  const segmentOptions =
    options?.map((option) => {
      const optionValue = typeof option === 'string' ? option : String(option);
      const optionLabel = typeof option === 'string' ? option : String(option);

      // Use enum mappings for localization if available
      const localizedLabel = enumMappings?.[optionValue]
        ? localize(enumMappings[optionValue] as TranslationKeys) ||
          String(enumMappings[optionValue])
        : optionLabel;

      return {
        label: String(localizedLabel),
        value: optionValue,
        disabled: false,
      };
    }) || [];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start gap-6',
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full',
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          {showLabel === true && (
            <div className="flex w-full justify-between">
              <Label
                htmlFor={`${settingKey}-dynamic-segment`}
                className="text-left text-sm font-medium"
              >
                {labelCode ? (localize(label as TranslationKeys) ?? label) : label || settingKey}
                {showDefault && (
                  <small className="opacity-40">
                    ({localize('com_endpoint_default')}: {defaultValue})
                  </small>
                )}
              </Label>
            </div>
          )}
          <SegmentedControl
            options={segmentOptions}
            value={selectedValue}
            onValueChange={handleChange}
            disabled={readonly}
            className="w-full min-w-0"
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

export default DynamicSegment;
