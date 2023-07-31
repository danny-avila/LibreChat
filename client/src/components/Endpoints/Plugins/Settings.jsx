import { cn } from '~/utils/';
import { useRecoilValue } from 'recoil';
import TextareaAutosize from 'react-textarea-autosize';
import {
  SelectDropDown,
  Input,
  Label,
  Slider,
  InputNumber,
  HoverCard,
  HoverCardTrigger,
} from '~/components';
import OptionHover from './OptionHover';
import { localize } from '~/localization/Translation';
import { defaultTextProps } from '~/utils/';

const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent focus:ring-[#10a37f] focus:ring-offset-0 focus:ring-opacity-100 hover:bg-gray-800/10 dark:hover:bg-white/10 focus:bg-gray-800/10 dark:focus:bg-white/10 transition-colors';

import store from '~/store';

function Settings(props) {
  const {
    readonly,
    model,
    chatGptLabel,
    promptPrefix,
    temperature,
    topP,
    freqP,
    presP,
    setOption,
    tools,
  } = props;
  const endpoint = 'gptPlugins';
  const lang = useRecoilValue(store.lang);

  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const setModel = setOption('model');
  const setChatGptLabel = setOption('chatGptLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('top_p');
  const setFreqP = setOption('presence_penalty');
  const setPresP = setOption('frequency_penalty');

  const toolsSelected = tools?.length > 0;
  const models = endpointsConfig?.[endpoint]?.['availableModels'] || [];

  return (
    <div className="h-[490px] overflow-y-auto md:h-[350px]">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <SelectDropDown
              title={localize(lang, 'com_endpoint_completion_model')}
              value={model}
              setValue={setModel}
              availableValues={models}
              disabled={readonly}
              className={cn(
                defaultTextProps,
                'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0',
              )}
              containerClassName="flex w-full resize-none"
            />
          </div>
          <>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                {localize(lang, 'com_endpoint_custom_name')}{' '}
                <small className="opacity-40">
                  ({localize(lang, 'com_endpoint_default_empty')} |{' '}
                  {localize(lang, 'com_endpoint_disabled_with_tools')})
                </small>
              </Label>
              <Input
                id="chatGptLabel"
                disabled={readonly || toolsSelected}
                value={chatGptLabel || ''}
                onChange={(e) => setChatGptLabel(e.target.value || null)}
                placeholder={
                  toolsSelected
                    ? localize(lang, 'com_endpoint_disabled_with_tools_placeholder')
                    : localize(lang, 'com_endpoint_openai_custom_name_placeholder')
                }
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0',
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="promptPrefix" className="text-left text-sm font-medium">
                {localize(lang, 'com_endpoint_prompt_prefix')}{' '}
                <small className="opacity-40">
                  ({localize(lang, 'com_endpoint_default_empty')} |{' '}
                  {localize(lang, 'com_endpoint_disabled_with_tools')})
                </small>
              </Label>
              <TextareaAutosize
                id="promptPrefix"
                disabled={readonly || toolsSelected}
                value={promptPrefix || ''}
                onChange={(e) => setPromptPrefix(e.target.value || null)}
                placeholder={
                  toolsSelected
                    ? localize(lang, 'com_endpoint_disabled_with_tools_placeholder')
                    : localize(
                      lang,
                      'com_endpoint_plug_set_custom_instructions_for_gpt_placeholder',
                    )
                }
                className={cn(
                  defaultTextProps,
                  'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 ',
                )}
              />
            </div>
          </>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_temperature')}{' '}
                  <small className="opacity-40">
                    ({localize(lang, 'com_endpoint_default_with_num', 0.8)})
                  </small>
                </Label>
                <InputNumber
                  id="temp-int"
                  disabled={readonly}
                  value={temperature}
                  onChange={(value) => setTemperature(value)}
                  max={2}
                  min={0}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    ),
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[temperature]}
                onValueChange={(value) => setTemperature(value[0])}
                doubleClickHandler={() => setTemperature(0.8)}
                max={2}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="temp" side="left" />
          </HoverCard>
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="top-p-int" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_top_p')}{' '}
                  <small className="opacity-40">
                    ({localize(lang, 'com_endpoint_default_with_num', 1)})
                  </small>
                </Label>
                <InputNumber
                  id="top-p-int"
                  disabled={readonly}
                  value={topP}
                  onChange={(value) => setTopP(value)}
                  max={1}
                  min={0}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    ),
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[topP]}
                onValueChange={(value) => setTopP(value[0])}
                doubleClickHandler={() => setTopP(1)}
                max={1}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="topp" side="left" />
          </HoverCard>

          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="freq-penalty-int" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_frequency_penalty')}{' '}
                  <small className="opacity-40">
                    ({localize(lang, 'com_endpoint_default_with_num', 0)})
                  </small>
                </Label>
                <InputNumber
                  id="freq-penalty-int"
                  disabled={readonly}
                  value={freqP}
                  onChange={(value) => setFreqP(value)}
                  max={2}
                  min={-2}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    ),
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[freqP]}
                onValueChange={(value) => setFreqP(value[0])}
                doubleClickHandler={() => setFreqP(0)}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="freq" side="left" />
          </HoverCard>

          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="pres-penalty-int" className="text-left text-sm font-medium">
                  {localize(lang, 'com_endpoint_presence_penalty')}{' '}
                  <small className="opacity-40">
                    ({localize(lang, 'com_endpoint_default_with_num', 0)})
                  </small>
                </Label>
                <InputNumber
                  id="pres-penalty-int"
                  disabled={readonly}
                  value={presP}
                  onChange={(value) => setPresP(value)}
                  max={2}
                  min={-2}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    ),
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[presP]}
                onValueChange={(value) => setPresP(value[0])}
                doubleClickHandler={() => setPresP(0)}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="pres" side="left" />
          </HoverCard>
        </div>
      </div>
    </div>
  );
}

export default Settings;
