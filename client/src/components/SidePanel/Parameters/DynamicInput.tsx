import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { useLocalize, useDebouncedInput, useParameterEffects } from '~/hooks';
import { Label, Input, HoverCard, HoverCardTrigger } from '~/components/ui';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import { cn } from '~/utils';

function DynamicInput({
  label = '',
  settingKey,
  defaultValue,
  description = '',
  type = 'string',
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

  const [setInputValue, inputValue, setLocalValue] = useDebouncedInput<string | null>({
    optionKey: optionType !== OptionTypes.Custom ? settingKey : undefined,
    initialValue:
      optionType !== OptionTypes.Custom
        ? (conversation?.[settingKey] as string)
        : (defaultValue as string),
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
    const value = e.target.value;
    if (type !== 'number') {
      setInputValue(e);
      return;
    }

    if (value === '') {
      setInputValue(e);
    } else if (!isNaN(Number(value))) {
      setInputValue(e, true);
    }
  };

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
              className="text-left text-sm font-medium"
            >
              {labelCode ? localize(label) || label : label || settingKey}{' '}
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
            value={inputValue ?? ''}
            onChange={handleInputChange}
            placeholder={placeholderCode ? localize(placeholder) || placeholder : placeholder}
            className={cn(
              'flex h-10 max-h-10 w-full resize-none border-none bg-surface-secondary px-3 py-2',
            )}
          />
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={descriptionCode ? localize(description) || description : description}
            side={ESide.Left}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicInput;
