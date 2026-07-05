import { OptionTypes, SettingTypes } from 'librechat-data-provider';
import { Label, Input, HoverCard, HoverCardTrigger } from '@librechat/client';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { useLocalize, useDebouncedInput, useParameterEffects, TranslationKeys } from '~/hooks';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import { cn } from '~/utils';

const PARTIAL_NUMBER_PATTERN = /^-?\d*\.?\d*$/;

function DynamicInput({
  type,
  label = '',
  settingKey,
  defaultValue,
  description = '',
  columnSpan,
  setOption,
  optionType,
  placeholder = '',
  readonly = false,
  showDefault = false,
  labelCode = false,
  descriptionCode = false,
  placeholderCode = false,
  conversation,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();

  const [setInputValue, inputValue, setLocalValue] = useDebouncedInput<string | number>({
    optionKey: settingKey,
    initialValue: optionType !== OptionTypes.Custom ? conversation?.[settingKey] : defaultValue,
    setter: () => ({}),
    setOption,
  });

  useParameterEffects({
    preset,
    settingKey,
    defaultValue: typeof defaultValue === 'undefined' ? '' : defaultValue,
    conversation,
    inputValue,
    setInputValue: setLocalValue,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const parsesAsNumber = !isNaN(Number(value));
    if (type !== SettingTypes.Number) {
      setInputValue(e, type === SettingTypes.String ? false : parsesAsNumber);
      return;
    }
    if (value === '') {
      setInputValue(e, true);
      return;
    }
    if (!parsesAsNumber && !PARTIAL_NUMBER_PATTERN.test(value)) {
      return;
    }
    /** Partial input ("-", "1.") displays locally without committing to form state */
    if (!parsesAsNumber || value.endsWith('.')) {
      setLocalValue(value);
      return;
    }
    setInputValue(e, true);
  };

  const placeholderText = placeholderCode
    ? localize(placeholder as TranslationKeys) || placeholder
    : placeholder;

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
              htmlFor={`${settingKey}-dynamic-input`}
              className="text-left text-xs font-medium"
            >
              {labelCode ? localize(label as TranslationKeys) || label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  (
                  {typeof defaultValue === 'undefined' || !(defaultValue as string).length
                    ? localize('com_endpoint_default_blank')
                    : `${localize('com_endpoint_default')}: ${defaultValue}`}
                  )
                </small>
              )}
            </Label>
          </div>
          <Input
            id={`${settingKey}-dynamic-input`}
            disabled={readonly}
            value={inputValue ?? defaultValue ?? ''}
            onChange={handleInputChange}
            placeholder={placeholderText}
            className={cn(
              'flex h-9 max-h-9 w-full resize-none rounded-lg border border-border-light bg-surface-secondary px-3 py-2',
            )}
          />
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={
              descriptionCode
                ? localize(description as TranslationKeys) || description
                : description
            }
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicInput;
