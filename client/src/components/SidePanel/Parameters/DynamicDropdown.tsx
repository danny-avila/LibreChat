import React, { useMemo, useState } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, HoverCard, HoverCardTrigger, SelectDropDown } from '~/components/ui';
import { cn, capitalizeFirstLetter } from '~/utils';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

function DynamicDropdown({
  label,
  settingKey,
  defaultValue,
  description,
  columnSpan,
  setOption,
  optionType,
  options,
  // type: _type,
  readonly = false,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { conversation = {} } = useChatContext();
  const [customValue, setCustomValue] = useState<string | null>(null);

  const selectedValue = useMemo(() => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      return customValue;
    }

    return conversation?.[settingKey] ?? defaultValue;
  }, [conversation, defaultValue, optionType, settingKey, customValue]);

  const handleChange = (value: string) => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      setCustomValue(value);
      return;
    }
    setOption(settingKey)(value);
  };

  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start gap-6',
        columnSpan ? `col-span-${columnSpan}` : 'col-span-full',
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex w-full justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-dropdown`}
              className="text-left text-sm font-medium"
            >
              {capitalizeFirstLetter(label ?? settingKey)}
              <small className="opacity-40">
                ({localize('com_endpoint_default')}: {defaultValue})
              </small>
            </Label>
          </div>
          <SelectDropDown
            showLabel={false}
            emptyTitle={true}
            disabled={readonly}
            value={selectedValue}
            setValue={handleChange}
            availableValues={options}
            containerClassName="w-full"
            id={`${settingKey}-dynamic-dropdown`}
          />
        </HoverCardTrigger>
        {description && <OptionHover description={description} side={ESide.Left} />}
      </HoverCard>
    </div>
  );
}

export default DynamicDropdown;
