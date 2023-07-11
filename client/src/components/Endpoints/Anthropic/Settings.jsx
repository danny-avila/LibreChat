import React from 'react';
import { useRecoilValue } from 'recoil';
import TextareaAutosize from 'react-textarea-autosize';
import SelectDropDown from '../../ui/SelectDropDown';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Slider } from '~/components/ui/Slider.tsx';
import { InputNumber } from '~/components/ui/InputNumber.tsx';
import OptionHover from './OptionHover';
import { HoverCard, HoverCardTrigger } from '~/components/ui/HoverCard.tsx';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent focus:ring-[#10a37f] focus:ring-offset-0 focus:ring-opacity-100 hover:bg-gray-800/10 dark:hover:bg-white/10 focus:bg-gray-800/10 dark:focus:bg-white/10 transition-colors';

import store from '~/store';

function Settings(props) {
  const {
    readonly,
    model,
    modelLabel,
    promptPrefix,
    temperature,
    topP,
    topK,
    maxOutputTokens,
    setOption
  } = props;

  console.log("settings", props)
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  const setModel = setOption('model');
  const setModelLabel = setOption('modelLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('topP');
  const setTopK = setOption('topK');
  const setMaxOutputTokens = setOption('maxOutputTokens');

  const models = endpointsConfig?.['anthropic']?.['availableModels'] || [];

  return (
    <div className={`h-[490px] overflow-y-auto md:h-[350px]`}>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <SelectDropDown
              value={model}
              setValue={setModel}
              availableValues={models}
              disabled={readonly}
              className={cn(
                defaultTextProps,
                'z-50 flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
              containerClassName="flex w-full resize-none"
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="modelLabel" className="text-left text-sm font-medium">
              Custom Name <small className="opacity-40">(default: blank)</small>
            </Label>
            <Input
              id="modelLabel"
              disabled={readonly}
              value={modelLabel || ''}
              onChange={(e) => setModelLabel(e.target.value || null)}
              placeholder="Set a custom name for Claude"
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="promptPrefix" className="text-left text-sm font-medium">
              Prompt Prefix <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly}
              value={promptPrefix || ''}
              onChange={(e) => setPromptPrefix(e.target.value || null)}
              placeholder="Set custom instructions or context. Ignored if empty."
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
              )}
            />
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="temp-int" className="text-left text-sm font-medium">
                  Temperature <small className="opacity-40">(default: 0.7)</small>
                </Label>
                <InputNumber
                  id="temp-int"
                  disabled={readonly}
                  value={temperature}
                  onChange={(value) => setTemperature(value)}
                  max={1}
                  min={0}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[temperature]}
                onValueChange={(value) => setTemperature(value[0])}
                doubleClickHandler={() => setTemperature(1)}
                max={1}
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
                  Top P <small className="opacity-40">(default: 0.95)</small>
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
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
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
                <Label htmlFor="top-k-int" className="text-left text-sm font-medium">
                  Top K <small className="opacity-40">(default: 40)</small>
                </Label>
                <InputNumber
                  id="top-k-int"
                  disabled={readonly}
                  value={topK}
                  onChange={(value) => setTopK(value)}
                  max={40}
                  min={1}
                  step={0.01}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[topK]}
                onValueChange={(value) => setTopK(value[0])}
                doubleClickHandler={() => setTopK(0)}
                max={40}
                min={1}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="topk" side="left" />
          </HoverCard>
          <HoverCard openDelay={300}>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label htmlFor="max-tokens-int" className="text-left text-sm font-medium">
                  Max Output Tokens <small className="opacity-40">(default: 1024)</small>
                </Label>
                <InputNumber
                  id="max-tokens-int"
                  disabled={readonly}
                  value={maxOutputTokens}
                  onChange={(value) => setMaxOutputTokens(value)}
                  max={1024}
                  min={1}
                  step={1}
                  controls={false}
                  className={cn(
                    defaultTextProps,
                    cn(
                      optionText,
                      'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200'
                    )
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[maxOutputTokens]}
                onValueChange={(value) => setMaxOutputTokens(value[0])}
                doubleClickHandler={() => setMaxOutputTokens(0)}
                max={1024}
                min={1}
                step={1}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover type="maxoutputtokens" side="left" />
          </HoverCard>
        </div>
      </div>
    </div>
  );
}

export default Settings;
