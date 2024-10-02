import { useMemo, useState, useCallback } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, HoverCard, HoverCardTrigger } from '~/components/ui';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useLocalize, useParameterEffects } from '~/hooks';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import { cn } from '~/utils';

function DynamicCombobox({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  setOption,
  optionType,
  options: _options,
  items: _items,
  showLabel = true,
  showDefault = false,
  labelCode = false,
  descriptionCode = false,
  searchPlaceholderCode = false,
  selectPlaceholderCode = false,
  conversation,
  isCollapsed = false,
  SelectIcon = null,
  selectPlaceholder = '',
  searchPlaceholder = '',
}: DynamicSettingProps & { isCollapsed?: boolean; SelectIcon?: React.ReactNode }) {
  const localize = useLocalize();
  const { preset } = useChatContext();
  const [inputValue, setInputValue] = useState<string | null>(null);

  const selectedValue = useMemo(() => {
    if (optionType === OptionTypes.Custom) {
      return inputValue;
    }
    return conversation?.[settingKey] ?? defaultValue;
  }, [conversation, defaultValue, optionType, settingKey, inputValue]);

  const items = useMemo(() => {
    if (_items != null) {
      return _items;
    }
    return (_options ?? []).map((option) => ({
      label: option,
      value: option,
    }));
  }, [_options, _items]);

  const handleChange = useCallback(
    (value: string) => {
      if (optionType === OptionTypes.Custom) {
        setInputValue(value);
      } else {
        setOption(settingKey)(value);
      }
    },
    [optionType, setOption, settingKey],
  );

  useParameterEffects({
    preset,
    settingKey,
    defaultValue,
    conversation,
    inputValue,
    setInputValue,
    preventDelayedUpdate: true,
  });

  const options = items ?? _options ?? [];
  if (options.length === 0) {
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
          {showLabel === true && (
            <div className="flex w-full justify-between">
              <Label
                htmlFor={`${settingKey}-dynamic-combobox`}
                className="text-left text-sm font-medium"
              >
                {labelCode ? localize(label) ?? label : label || settingKey}
                {showDefault && (
                  <small className="opacity-40">
                    ({localize('com_endpoint_default')}: {defaultValue})
                  </small>
                )}
              </Label>
            </div>
          )}
          <ControlCombobox
            displayValue={selectedValue}
            selectPlaceholder={
              selectPlaceholderCode === true ? localize(selectPlaceholder) : selectPlaceholder
            }
            searchPlaceholder={
              searchPlaceholderCode === true ? localize(searchPlaceholder) : searchPlaceholder
            }
            isCollapsed={isCollapsed}
            ariaLabel={settingKey}
            selectedValue={selectedValue ?? ''}
            setValue={handleChange}
            items={items}
            SelectIcon={SelectIcon}
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

export default DynamicCombobox;
