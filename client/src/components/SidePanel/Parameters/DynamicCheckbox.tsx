// client/src/components/SidePanel/Parameters/DynamicCheckbox.tsx
import { useMemo, useState } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Checkbox, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useLocalize, useParameterEffects } from '~/hooks';
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
  showDefault = true,
  labelCode = false,
  descriptionCode = false,
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();
  const [inputValue, setInputValue] = useState<boolean>(!!(defaultValue as boolean | undefined));

  const selectedValue = useMemo(() => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      return inputValue;
    }

    return conversation?.[settingKey] ?? defaultValue;
  }, [conversation, defaultValue, optionType, settingKey, inputValue]);

  const handleCheckedChange = (checked: boolean) => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      setInputValue(checked);
      return;
    }
    setOption(settingKey)(checked);
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
              {labelCode ? localize(label) ?? label : label || settingKey}{' '}
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
            description={descriptionCode ? localize(description) ?? description : description}
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicCheckbox;
