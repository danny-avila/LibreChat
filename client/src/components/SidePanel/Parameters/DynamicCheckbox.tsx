import { useMemo } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Checkbox, HoverCard, HoverCardTrigger } from '~/components/ui';
import { TranslationKeys, useLocalize, useDebouncedInput, useParameterEffects } from '~/hooks';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';

function DynamicCheckbox({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  setOption,
  optionType,
  readonly = false,
  showDefault = false,
  labelCode = false,
  descriptionCode = false,
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();

  const [setInputValue, inputValue, setLocalValue] = useDebouncedInput<boolean>({
    optionKey: settingKey,
    initialValue: optionType !== OptionTypes.Custom ? conversation?.[settingKey] : defaultValue,
    setter: () => ({}),
    setOption,
  });

  const selectedValue = useMemo(() => {
    return conversation?.[settingKey] ?? defaultValue;
  }, [conversation, defaultValue, settingKey]);

  const handleCheckedChange = (checked: boolean) => {
    setInputValue(checked);
    setOption(settingKey)(checked);
  };

  useParameterEffects({
    preset,
    settingKey,
    defaultValue,
    conversation,
    inputValue,
    setInputValue: setLocalValue,
  });

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
              {labelCode ? localize(label as TranslationKeys) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  ({localize('com_endpoint_default')}:{' '}
                  {defaultValue != null ? localize('com_ui_yes') : localize('com_ui_no')})
                </small>
              )}
            </Label>
            <Checkbox
              id={`${settingKey}-dynamic-checkbox`}
              disabled={readonly}
              checked={selectedValue}
              onCheckedChange={handleCheckedChange}
              className="mt-[2px] focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
            />
          </div>
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={descriptionCode ? localize(description as TranslationKeys) ?? description : description}
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicCheckbox;
