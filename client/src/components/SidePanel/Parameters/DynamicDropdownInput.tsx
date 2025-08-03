import React, { useState, useMemo } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Label,
  SelectDropDown,
} from '@librechat/client';
import { DynamicInput } from './';
import { TranslationKeys, useLocalize } from '~/hooks';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicDropdownInput({
  label = '',
  settingKey,
  description = '',
  setOption,
  labelCode = false,
  descriptionCode = false,
  placeholder = 'Enter value',
  options = ['option1', 'option2', 'option3'],
  defaultValues = {},
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();

  // Use the keys from defaultValues as the actual options
  const actualOptions = Object.keys(defaultValues);
  const [selectedOption, setSelectedOption] = useState(actualOptions[0]);

  const currentValues = useMemo(() => {
    const values = { ...defaultValues };

    // For fileTokenLimits, prioritize individual URL parameters
    if (settingKey === 'fileTokenLimits') {
      const conv = conversation as any;
      if (conv?.imageTokenLimit !== undefined) values.image = conv.imageTokenLimit;
      if (conv?.textTokenLimit !== undefined) values.text = conv.textTokenLimit;
      if (conv?.documentTokenLimit !== undefined) values.document = conv.documentTokenLimit;
    }

    // Check for compound object value as fallback
    const compoundValue = conversation?.[settingKey];
    if (compoundValue && typeof compoundValue === 'object') {
      Object.assign(values, compoundValue);
    }

    return values;
  }, [conversation, settingKey, defaultValues]);

  const handleOptionChange = (value: string) => {
    setSelectedOption(value);
  };

  const displayLabel = labelCode
    ? localize(label as TranslationKeys) || label
    : label || settingKey;
  const displayDescription = descriptionCode
    ? localize(description as TranslationKeys) || description
    : description;

  return (
    <div className={`grid gap-6`}>
      <div className="flex flex-col items-start justify-start">
        <HoverCard openDelay={300}>
          <HoverCardTrigger className="grid w-full">
            <div className="flex w-full justify-between">
              <Label
                htmlFor={`${settingKey}-dropdown-input`}
                className="text-left text-sm font-medium"
              >
                {displayLabel}
              </Label>
            </div>

            <div className="flex flex-col gap-2">
              <SelectDropDown
                value={
                  options[actualOptions.indexOf(selectedOption)]
                    ? localize(options[actualOptions.indexOf(selectedOption)] as TranslationKeys) ||
                      options[actualOptions.indexOf(selectedOption)]
                    : selectedOption
                }
                setValue={(localizedValue) => {
                  // Find which option index this localized value corresponds to
                  const optionIndex = options.findIndex(
                    (option) => (localize(option as TranslationKeys) || option) === localizedValue,
                  );
                  if (optionIndex >= 0 && actualOptions[optionIndex]) {
                    handleOptionChange(actualOptions[optionIndex]);
                  }
                }}
                availableValues={options.map(
                  (option) => localize(option as TranslationKeys) || option,
                )}
                className="min-w-[100px]"
              />

              <DynamicInput
                settingKey={`${settingKey}_${selectedOption}`}
                setOption={(_key) => (value) => {
                  // Only update individual URL params - no compound object
                  if (settingKey === 'fileTokenLimits') {
                    const paramMap = {
                      image: 'imageTokenLimit',
                      text: 'textTokenLimit',
                      document: 'documentTokenLimit',
                    };
                    const urlParam = paramMap[selectedOption as keyof typeof paramMap];
                    if (urlParam) {
                      setOption(urlParam)(value);
                    }
                  }
                }}
                conversation={{
                  [`${settingKey}_${selectedOption}`]: currentValues[selectedOption],
                }}
                placeholder={placeholder}
                showLabel={false}
              />
            </div>
          </HoverCardTrigger>

          {displayDescription && (
            <HoverCardContent side="right" className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">{displayDescription}</p>
              </div>
            </HoverCardContent>
          )}
        </HoverCard>
      </div>
    </div>
  );
}

export default DynamicDropdownInput;
