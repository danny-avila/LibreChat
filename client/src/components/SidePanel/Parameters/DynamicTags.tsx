// client/src/components/SidePanel/Parameters/DynamicTags.tsx
import React, { useState, useCallback, useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Label, Input, HoverCard, HoverCardTrigger, Tag } from '~/components/ui';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps } from '~/utils';
import OptionHover from './OptionHover';
import { ESide } from '~/common';
import type { DynamicSettingProps } from 'librechat-data-provider';

function DynamicTags({
  label = '',
  settingKey,
  defaultValue = [],
  description = '',
  columnSpan,
  placeholder = '',
  readonly = false,
  showDefault = true,
  labelCode,
  descriptionCode,
  placeholderCode,
  descriptionSide = ESide.Left,
  minTags,
  maxTags,
}: DynamicSettingProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { control } = useFormContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tagText, setTagText] = useState<string>('');

  const onTagClick = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

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
              {labelCode === true ? localize(label) ?? label : label || settingKey}{' '}
              {showDefault && (
                <small className="opacity-40">
                  {typeof defaultValue === 'undefined' ||
                  !((defaultValue as string[] | undefined)?.length ?? 0)
                    ? localize('com_endpoint_default_blank')
                    : `${localize('com_endpoint_default')}: ${(defaultValue as string[]).join(
                      ', ',
                    )}`}
                </small>
              )}
            </Label>
          </div>
          <Controller
            name={settingKey}
            control={control}
            defaultValue={defaultValue as string[]}
            render={({ field }) => (
              <div>
                <div className="bg-muted mb-2 flex flex-wrap gap-1 break-all rounded-lg">
                  {field.value?.map((tag: string, index: number) => (
                    <Tag
                      key={`${tag}-${index}`}
                      label={tag}
                      onClick={onTagClick}
                      onRemove={() => {
                        if (minTags != null && field.value.length <= minTags) {
                          showToast({
                            message: localize('com_ui_min_tags', minTags + ''),
                            status: 'warning',
                          });
                          return;
                        }
                        const newTags = field.value.filter((_, i) => i !== index);
                        field.onChange(newTags);
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
                      if (e.key === 'Backspace' && !tagText && field.value.length > 0) {
                        const newTags = field.value.slice(0, -1);
                        field.onChange(newTags);
                      }
                      if (e.key === 'Enter' && tagText) {
                        const newTags = [...field.value, tagText];
                        if (maxTags != null && newTags.length > maxTags) {
                          showToast({
                            message: localize('com_ui_max_tags', maxTags + ''),
                            status: 'warning',
                          });
                          return;
                        }
                        field.onChange(newTags);
                        setTagText('');
                      }
                    }}
                    onChange={(e) => setTagText(e.target.value)}
                    placeholder={
                      placeholderCode === true ? localize(placeholder) ?? placeholder : placeholder
                    }
                    className={cn(defaultTextProps, 'flex h-10 max-h-10 px-3 py-2')}
                  />
                </div>
              </div>
            )}
          />
        </HoverCardTrigger>
        {description && (
          <OptionHover
            description={
              descriptionCode === true ? localize(description) ?? description : description
            }
            side={descriptionSide as ESide}
          />
        )}
      </HoverCard>
    </div>
  );
}

export default DynamicTags;
