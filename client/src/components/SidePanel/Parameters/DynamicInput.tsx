// client/src/components/SidePanel/Parameters/DynamicInput.tsx
import { useEffect } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Input, HoverCard, HoverCardTrigger } from '~/components/ui';
import { cn, defaultTextProps, capitalizeFirstLetter } from '~/utils';
import { useLocalize, useDebouncedInput } from '~/hooks';
import { ESide, defaultDebouncedDelay } from '~/common';
import { useChatContext } from '~/Providers';
import OptionHover from './OptionHover';

function DynamicInput({
  label,
  settingKey,
  defaultValue,
  description,
  columnSpan,
  setOption,
  optionType,
  placeholder,
  readonly = false,
  showDefault = true,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { conversation = {} } = useChatContext();

  const [setInputValue, inputValue] = useDebouncedInput<string>({
    optionKey: optionType !== OptionTypes.Custom ? settingKey : undefined,
    initialValue:
      optionType !== OptionTypes.Custom
        ? (conversation?.[settingKey] as string)
        : (defaultValue as string),
    setter: () => ({}),
    setOption,
  });

  /** Updates the local state value if global (conversation) is updated elsewhere */
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (conversation?.[settingKey] === inputValue) {
        return;
      }
      setInputValue(conversation?.[settingKey]);
    }, defaultDebouncedDelay * 1.5);

    return () => clearTimeout(timeout);
  }, [setInputValue, conversation, inputValue, settingKey]);

  return (
    <div
      className={`flex flex-col items-center justify-start gap-6 ${
        columnSpan ? `col-span-${columnSpan}` : 'col-span-full'
      }`}
    >
      <HoverCard openDelay={300}>
        <HoverCardTrigger className="grid w-full items-center gap-2">
          <div className="flex w-full justify-between">
            <Label
              htmlFor={`${settingKey}-dynamic-input`}
              className="text-left text-sm font-medium"
            >
              {capitalizeFirstLetter(label ?? settingKey)}{' '}
              {showDefault && (
                <small className="opacity-40">
                  (
                  {typeof defaultValue === 'undefined' || !(defaultValue as string)?.length
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
            value={inputValue}
            onChange={setInputValue}
            placeholder={placeholder}
            className={cn(defaultTextProps, 'flex h-10 max-h-10 w-full resize-none px-3 py-2')}
          />
        </HoverCardTrigger>
        {description && <OptionHover description={description} side={ESide.Left} />}
      </HoverCard>
    </div>
  );
}

export default DynamicInput;
