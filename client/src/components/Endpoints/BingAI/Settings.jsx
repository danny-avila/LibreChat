import { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Label } from '~/components/ui/Label.tsx';
import { Checkbox } from '~/components/ui/Checkbox.tsx';
import SelectDropDown from '../../ui/SelectDropDown';
import { cn } from '~/utils/';
import useDebounce from '~/hooks/useDebounce';
import { useUpdateTokenCountMutation } from '@librechat/data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function Settings(props) {
  const { readonly, context, systemMessage, jailbreak, toneStyle, setOption } = props;
  const [tokenCount, setTokenCount] = useState(0);
  const showSystemMessage = jailbreak;
  const setContext = setOption('context');
  const setSystemMessage = setOption('systemMessage');
  const setJailbreak = setOption('jailbreak');
  const setToneStyle = (value) => setOption('toneStyle')(value.toLowerCase());
  const debouncedContext = useDebounce(context, 250);
  const updateTokenCountMutation = useUpdateTokenCountMutation();
  const lang = useRecoilValue(store.lang);

  useEffect(() => {
    if (!debouncedContext || debouncedContext.trim() === '') {
      setTokenCount(0);
      return;
    }

    const handleTextChange = (context) => {
      updateTokenCountMutation.mutate(
        { text: context },
        {
          onSuccess: (data) => {
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
              title={null}
              value={`${toneStyle.charAt(0).toUpperCase()}${toneStyle.slice(1)}`}
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
              onChange={(e) => setContext(e.target.value || null)}
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
                onChange={(e) => setSystemMessage(e.target.value || null)}
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

export default Settings;
