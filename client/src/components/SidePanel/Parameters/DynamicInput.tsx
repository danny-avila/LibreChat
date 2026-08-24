import { OptionTypes, SettingTypes } from 'librechat-data-provider';
import { Label, Input, HoverCard, HoverCardTrigger } from '@librechat/client';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { useLocalize, useDebouncedInput, useParameterEffects, TranslationKeys } from '~/hooks';
import { cn, sanitizeIntegerInput } from '~/utils';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';

function DynamicInput({
  type,
  range,
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
    if (type === SettingTypes.Number) {
      // Integer params: strip thousands separators so "120,000" / "120.000"
      // become 120000 instead of being truncated to 120 downstream by parseInt.
      // Keep a leading minus for fields whose range permits negatives (e.g.
      // Google thinkingBudget, where -1 selects dynamic/auto thinking).
      const allowNegative = range != null && range.min < 0;
      const sanitized = sanitizeIntegerInput(e.target.value, allowNegative);
      // A lone "-" is an in-progress negative; keep it as a string so the field
      // shows the sign instead of coercing Number("-") to NaN. It resolves to a
      // number as soon as a digit is typed.
      setInputValue(sanitized, sanitized !== '-');
      return;
    }
    setInputValue(e, type === SettingTypes.String ? false : !isNaN(Number(e.target.value)));
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
            inputMode={type === 'number' ? 'numeric' : undefined}
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
