import { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Label, Checkbox, SelectDropDown } from '~/components/ui';
import {
  useUpdateTokenCountMutation,
  TUpdateTokenCountResponse,
  SettingsProps,
} from 'librechat-data-provider';
import useDebounce from '~/hooks/useDebounce';
import { useRecoilValue } from 'recoil';
import { cn, defaultTextProps } from '~/utils/';
import store from '~/store';
import { localize } from '~/localization/Translation';

export default function Settings({ conversation, setOption, readonly }: SettingsProps) {
  const [tokenCount, setTokenCount] = useState(0);
  const lang = useRecoilValue(store.lang);
  const { context, systemMessage, jailbreak, toneStyle } = conversation;
  console.log('readonly', readonly);
  const debouncedContext = useDebounce(context?.trim() ?? '', 250);
  const updateTokenCountMutation = useUpdateTokenCountMutation();
  const showSystemMessage = jailbreak;

  const setContext = setOption('context');
  const setSystemMessage = setOption('systemMessage');
  const setJailbreak = setOption('jailbreak');
  const setToneStyle = (value: string) => setOption('toneStyle')(value.toLowerCase());

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

  return (
    <div className="h-[490px] overflow-y-auto md:h-[350px]">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
              {localize(lang, 'com_endpoint_tone_style')}{' '}
              <small className="opacity-40">
                ({localize(lang, 'com_endpoint_default_creative')})
              </small>
            </Label>
            <SelectDropDown
              id="toneStyle-dropdown"
              title={''}
              value={`${toneStyle?.charAt(0).toUpperCase()}${toneStyle?.slice(1)}`}
              setValue={setToneStyle}
              availableValues={['Creative', 'Fast', 'Balanced', 'Precise']}
              disabled={readonly}
              className={cn(
                defaultTextProps,
                'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0',
              )}
              containerClassName="flex w-full resize-none"
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="context" className="text-left text-sm font-medium">
              {localize(lang, 'com_endpoint_context')}{' '}
              <small className="opacity-40">({localize(lang, 'com_endpoint_default_blank')})</small>
            </Label>
            <TextareaAutosize
              id="context"
              disabled={readonly}
              value={context || ''}
              onChange={(e) => setContext(e.target.value ?? null)}
              placeholder={localize(lang, 'com_endpoint_bing_context_placeholder')}
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2',
              )}
            />
            <small className="mb-5 text-black dark:text-white">{`${localize(
              lang,
              'com_endpoint_token_count',
            )}: ${tokenCount}`}</small>
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="jailbreak" className="text-left text-sm font-medium">
              {localize(lang, 'com_endpoint_bing_enable_sydney')}{' '}
              <small className="opacity-40">({localize(lang, 'com_endpoint_default_false')})</small>
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
                {localize(lang, 'com_endpoint_bing_jailbreak')}{' '}
                <small>{localize(lang, 'com_endpoint_bing_to_enable_sydney')}</small>
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
                  {localize(lang, 'com_endpoint_system_message')}
                </a>{' '}
                <small className="opacity-40 dark:text-gray-50">
                  ( {localize(lang, 'com_endpoint_default_blank')})
                </small>
              </Label>

              <TextareaAutosize
                id="systemMessage"
                disabled={readonly}
                value={systemMessage || ''}
                onChange={(e) => setSystemMessage(e.target.value ?? null)}
                placeholder={localize(lang, 'com_endpoint_bing_system_message_placeholder')}
                className={cn(
                  defaultTextProps,
                  'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 placeholder:text-red-400',
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
