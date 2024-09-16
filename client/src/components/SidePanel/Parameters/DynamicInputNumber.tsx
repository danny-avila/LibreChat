import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import type { ValueType } from '@rc-component/mini-decimal';
import { Label, HoverCard, InputNumber, HoverCardTrigger } from '~/components/ui';
import { useLocalize, useDebouncedInput, useParameterEffects } from '~/hooks';
import { cn, defaultTextProps, optionText } from '~/utils';
import { ESide } from '~/common';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';

function DynamicInputNumber({
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
  placeholderCode = false,
  placeholder = '',
  conversation,
  range,
  className = '',
  inputClassName = '',
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();

  const [setInputValue, inputValue, setLocalValue] = useDebouncedInput<ValueType | null>({
    optionKey: optionType !== OptionTypes.Custom ? settingKey : undefined,
    initialValue:
      optionType !== OptionTypes.Custom
        ? (conversation?.[settingKey] as number)
        : (defaultValue as number),
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

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-start gap-6',
        columnSpan != null ? `col-span-${columnSpan}` : 'col-span-full',
        className,
      )}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex justify-between">
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
            <InputNumber
              id={`${settingKey}-dynamic-setting-input-number`}
              disabled={readonly}
              value={inputValue}
              onChange={setInputValue}
              min={range?.min}
              max={range?.max}
              step={range?.step}
              placeholder={placeholderCode ? localize(placeholder) ?? placeholder : placeholder}
              controls={false}
              className={cn(
                defaultTextProps,
                cn(
                  optionText,
                  'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                ),
                inputClassName,
              )}
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

export default DynamicInputNumber;
