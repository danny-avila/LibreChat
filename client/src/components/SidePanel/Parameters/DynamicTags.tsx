import { useState, useMemo, useCallback, useRef } from 'react';
import { OptionTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { Label, Input, HoverCard, HoverCardTrigger, Tag } from '~/components/ui';
import { useChatContext, useToastContext } from '~/Providers';
import { useLocalize, useParameterEffects } from '~/hooks';
import { cn, defaultTextProps } from '~/utils';
import OptionHover from './OptionHover';
import { ESide } from '~/common';

function DynamicTags({
  label = '',
  settingKey,
  defaultValue = [],
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
  descriptionSide = ESide.Left,
  conversation,
  minTags,
  maxTags,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { preset } = useChatContext();
  const { showToast } = useToastContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tagText, setTagText] = useState<string>('');
  const [tags, setTags] = useState<string[] | undefined>(
    (defaultValue as string[] | undefined) ?? [],
  );

  const updateState = useCallback(
    (update: string[]) => {
      if (optionType === OptionTypes.Custom) {
        // TODO: custom logic, add to payload but not to conversation
        setTags(update);
        return;
      }
      setOption(settingKey)(update);
    },
    [optionType, setOption, settingKey],
  );

  const onTagClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const currentTags: string[] | undefined = useMemo(() => {
    if (optionType === OptionTypes.Custom) {
      // TODO: custom logic, add to payload but not to conversation
      return tags;
    }

    if (!conversation?.[settingKey]) {
      return defaultValue ?? [];
    }

    return conversation[settingKey];
  }, [conversation, defaultValue, optionType, settingKey, tags]);

  const onTagRemove = useCallback(
    (indexToRemove: number) => {
      if (!currentTags) {
        return;
      }

      if (minTags != null && currentTags.length <= minTags) {
        showToast({
          message: localize('com_ui_min_tags', minTags + ''),
          status: 'warning',
        });
        return;
      }
      const update = currentTags.filter((_, index) => index !== indexToRemove);
      updateState(update);
    },
    [localize, minTags, currentTags, showToast, updateState],
  );

  const onTagAdd = useCallback(() => {
    if (!tagText) {
      return;
    }

    let update = [...(currentTags ?? []), tagText];
    if (maxTags != null && update.length > maxTags) {
      showToast({
        message: localize('com_ui_max_tags', maxTags + ''),
        status: 'warning',
      });
      update = update.slice(-maxTags);
    }
    updateState(update);
    setTagText('');
  }, [tagText, currentTags, updateState, maxTags, showToast, localize]);

  useParameterEffects({
    preset,
    settingKey,
    defaultValue: typeof defaultValue === 'undefined' ? [] : defaultValue,
    inputValue: tags,
    setInputValue: setTags,
    preventDelayedUpdate: true,
    conversation,
  });

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
              {labelCode ? localize(label) ?? label : label || settingKey}{' '}
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
          <div>
            <div className="mb-2 flex flex-wrap gap-1 break-all rounded-lg bg-muted">
              {currentTags?.map((tag: string, index: number) => (
                <Tag
                  key={`${tag}-${index}`}
                  label={tag}
                  onClick={onTagClick}
                  onRemove={() => {
                    onTagRemove(index);
                    if (inputRef.current) {
                      inputRef.current.focus();
                    }
                  }}
                />
              ))}
              <Input
                ref={inputRef}
                id={`${settingKey}-dynamic-input`}
                disabled={readonly}
                value={tagText}
                onKeyDown={(e) => {
                  if (!currentTags) {
                    return;
                  }
                  if (e.key === 'Backspace' && !tagText) {
                    onTagRemove(currentTags.length - 1);
                  }
                  if (e.key === 'Enter') {
                    onTagAdd();
                  }
                }}
                onChange={(e) => setTagText(e.target.value)}
                placeholder={placeholderCode ? localize(placeholder) ?? placeholder : placeholder}
                className={cn(defaultTextProps, 'flex h-10 max-h-10 px-3 py-2')}
              />
            </div>
          </div>
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={descriptionCode ? localize(description) ?? description : description}
            side={descriptionSide as ESide}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicTags;
