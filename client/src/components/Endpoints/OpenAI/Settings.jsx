import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import ModelDropDown from '../../ui/ModelDropDown';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Slider } from '~/components/ui/Slider.tsx';
// import { InputNumber } from '../../ui/InputNumber';
import OptionHover from './OptionHover';
import { HoverCard, HoverCardTrigger } from '~/components/ui/HoverCard.tsx';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent focus:ring-[#10a37f] focus:ring-offset-0 focus:ring-opacity-100 hover:bg-gray-800/10 dark:hover:bg-white/10 focus:bg-gray-800/10 dark:focus:bg-white/10 transition-colors';

function Settings(props) {
  const { readonly, model, chatGptLabel, promptPrefix, temperature, topP, freqP, presP, setOption } = props;

  const setModel = setOption('model');
  const setChatGptLabel = setOption('chatGptLabel');
  const setPromptPrefix = setOption('promptPrefix');
  const setTemperature = setOption('temperature');
  const setTopP = setOption('top_p');
  const setFreqP = setOption('presence_penalty');
  const setPresP = setOption('frequency_penalty');

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <ModelDropDown
              model={model}
              disabled={readonly}
              setModel={setModel}
              endpoint="openAI"
              className={cn(
                defaultTextProps,
                'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
              containerClassName="flex w-full resize-none"
            />
            {/* <Label
              htmlFor="model"
              className="text-left text-sm font-medium"
            >
              Model
            </Label>
            <Input
              id="model"
              value={model}
              // ref={inputRef}
              onChange={e => setModel(e.target.value)}
              placeholder="Set a custom name for ChatGPT"
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
            /> */}
          </div>
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="chatGptLabel"
              className="text-left text-sm font-medium"
            >
              Custom Name <small className="opacity-40">(default: blank)</small>
            </Label>
            <Input
              id="chatGptLabel"
              disabled={readonly}
              value={chatGptLabel || ''}
              // ref={inputRef}
              onChange={e => setChatGptLabel(e.target.value || null)}
              placeholder="Set a custom name for ChatGPT"
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="promptPrefix"
              className="text-left text-sm font-medium"
            >
              Prompt Prefix <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              disabled={readonly}
              value={promptPrefix || ''}
              onChange={e => setPromptPrefix(e.target.value || null)}
              placeholder="Set custom instructions. Defaults to: 'You are ChatGPT, a large language model trained by OpenAI.'"
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
              )}
              // onFocus={() => {
              //   textareaRef.current.classList.remove('max-h-10');
              //   textareaRef.current.classList.add('max-h-52');
              // }}
              // onBlur={() => {
              //   textareaRef.current.classList.remove('max-h-52');
              //   textareaRef.current.classList.add('max-h-10');
              // }}
              // ref={textareaRef}
            />
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label
                  htmlFor="chatGptLabel"
                  className="text-left text-sm font-medium"
                >
                  Temperature <small className="opacity-40">(default: 1)</small>
                </Label>
                <Input
                  id="temp-int"
                  disabled
                  value={temperature}
                  onChange={e => setTemperature(e.target.value)}
                  className={cn(
                    defaultTextProps,
                    cn(optionText, 'h-auto w-12 border-0 group-hover/temp:border-gray-200')
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[temperature]}
                onValueChange={value => setTemperature(value[0])}
                max={2}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              type="temp"
              side="left"
            />
          </HoverCard>

          {/* <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label
                  htmlFor="chatGptLabel"
                  className="text-left text-sm font-medium"
                >
                  Max tokens
                </Label>
                <Input
                  id="max-tokens-int"
                  disabled
                  value={maxTokens}
                  onChange={e => setMaxTokens(e.target.value)}
                  className={cn(
                    defaultTextProps,
                    cn(optionText, 'h-auto w-12 border-0 group-hover/temp:border-gray-200')
                  )}
                />
              </div>
              <Slider
              disabled={readonly}
                value={[maxTokens]}
                onValueChange={value => setMaxTokens(value[0])}
                max={2048} // should be dynamic to the currently selected model
                min={1}
                step={1}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              type="max"
              side="left"
            />
          </HoverCard> */}

          <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label
                  htmlFor="chatGptLabel"
                  className="text-left text-sm font-medium"
                >
                  Top P <small className="opacity-40">(default: 1)</small>
                </Label>
                <Input
                  id="top-p-int"
                  disabled
                  value={topP}
                  onChange={e => setTopP(e.target.value)}
                  className={cn(
                    defaultTextProps,
                    cn(optionText, 'h-auto w-12 border-0 group-hover/temp:border-gray-200')
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[topP]}
                onValueChange={value => setTopP(value[0])}
                max={1}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              type="topp"
              side="left"
            />
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label
                  htmlFor="chatGptLabel"
                  className="text-left text-sm font-medium"
                >
                  Frequency Penalty <small className="opacity-40">(default: 0)</small>
                </Label>
                <Input
                  id="freq-penalty-int"
                  disabled
                  value={freqP}
                  onChange={e => setFreqP(e.target.value)}
                  className={cn(
                    defaultTextProps,
                    cn(optionText, 'h-auto w-12 border-0 group-hover/temp:border-gray-200')
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[freqP]}
                onValueChange={value => setFreqP(value[0])}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              type="freq"
              side="left"
            />
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2">
              <div className="flex justify-between">
                <Label
                  htmlFor="chatGptLabel"
                  className="text-left text-sm font-medium"
                >
                  Presence Penalty <small className="opacity-40">(default: 0)</small>
                </Label>
                <Input
                  id="pres-penalty-int"
                  disabled
                  value={presP}
                  onChange={e => setPresP(e.target.value)}
                  className={cn(
                    defaultTextProps,
                    cn(optionText, 'h-auto w-12 border-0 group-hover/temp:border-gray-200')
                  )}
                />
              </div>
              <Slider
                disabled={readonly}
                value={[presP]}
                onValueChange={value => setPresP(value[0])}
                max={2}
                min={-2}
                step={0.01}
                className="flex h-4 w-full"
              />
            </HoverCardTrigger>
            <OptionHover
              type="pres"
              side="left"
            />
          </HoverCard>
        </div>
      </div>
    </>
  );
}

export default Settings;
