import { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useUpdateTokenCountMutation } from 'librechat-data-provider/react-query';
import type { TUpdateTokenCountResponse } from 'librechat-data-provider';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils/';
import { Label, Checkbox, SelectDropDown } from '~/components/ui';
import { useLocalize, useDebounce } from '~/hooks';
import type { TSettingsProps } from '~/common';

export default function Settings({ conversation, setOption, readonly }: TSettingsProps) {
  const localize = useLocalize();
  const [tokenCount, setTokenCount] = useState(0);
  const debouncedContext = useDebounce(conversation?.context?.trim() ?? '', 250);
  const updateTokenCountMutation = useUpdateTokenCountMutation();

  useEffect(() => {
    if (!debouncedContext || debouncedContext === '') {
      setTokenCount(0);
      return;
    }

    const handleTextChange = (context: string) => {
      updateTokenCountMutation.mutate(
        { text: context },
        {
          onSuccess: (data: TUpdateTokenCountResponse) => {
            setTokenCount(data.count);
          },
        },
      );
    };

    handleTextChange(debouncedContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedContext]);

  if (!conversation) {
    return null;
  }
  const { context, systemMessage, jailbreak, toneStyle } = conversation;
  const showSystemMessage = jailbreak;

  const setContext = setOption('context');
  const setSystemMessage = setOption('systemMessage');
  const setJailbreak = setOption('jailbreak');
  const setToneStyle = (value: string) => setOption('toneStyle')(value.toLowerCase());

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="col-span-1 flex flex-col items-center justify-start gap-6">
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
            {localize('com_endpoint_tone_style')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_creative')})</small>
          </Label>
          <SelectDropDown
            id="toneStyle-dropdown"
            title={''}
            value={`${toneStyle?.charAt(0).toUpperCase()}${toneStyle?.slice(1)}`}
            setValue={setToneStyle}
            availableValues={['Creative', 'Fast', 'Balanced', 'Precise']}
            disabled={readonly}
            className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusOutlines)}
            containerClassName="flex w-full resize-none"
          />
        </div>
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="context" className="text-left text-sm font-medium">
            {localize('com_endpoint_context')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
          </Label>
          <TextareaAutosize
            id="context"
            disabled={readonly}
            value={context || ''}
            onChange={(e) => setContext(e.target.value ?? null)}
            placeholder={localize('com_endpoint_bing_context_placeholder')}
            className={cn(
              defaultTextProps,
              'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2',
            )}
          />
          <small className="mb-5 text-black dark:text-white">{`${localize(
            'com_endpoint_token_count',
          )}: ${tokenCount}`}</small>
        </div>
      </div>
      <div className="col-span-1 flex flex-col items-center justify-start gap-6">
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="jailbreak" className="text-left text-sm font-medium">
            {localize('com_endpoint_bing_enable_sydney')}{' '}
            <small className="opacity-40">({localize('com_endpoint_default_false')})</small>
          </Label>
          <div className="flex h-[40px] w-full items-center space-x-3">
            <Checkbox
              id="jailbreak"
              disabled={readonly}
              checked={jailbreak}
              className="focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
              onCheckedChange={setJailbreak}
            />
            <label
              htmlFor="jailbreak"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
            >
              {localize('com_endpoint_bing_jailbreak')}{' '}
              <small>{localize('com_endpoint_bing_to_enable_sydney')}</small>
            </label>
          </div>
        </div>
        {showSystemMessage && (
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="systemMessage"
              className="text-left text-sm font-medium"
              style={{ opacity: showSystemMessage ? '1' : '0' }}
            >
              <a
                href="https://github.com/danny-avila/LibreChat/blob/main/docs/features/bing_jailbreak.md#default-system-message-for-jailbreak-mode-sydney"
                target="_blank"
                className="text-blue-500 transition-colors duration-200 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-500"
                rel="noreferrer"
              >
                {localize('com_endpoint_system_message')}
              </a>{' '}
              <small className="opacity-40 dark:text-gray-50">
                ( {localize('com_endpoint_default_blank')})
              </small>
            </Label>

            <TextareaAutosize
              id="systemMessage"
              disabled={readonly}
              value={systemMessage || ''}
              onChange={(e) => setSystemMessage(e.target.value ?? null)}
              placeholder={localize('com_endpoint_bing_system_message_placeholder')}
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 placeholder:text-red-400',
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
