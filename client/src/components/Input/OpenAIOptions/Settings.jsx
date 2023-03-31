import React, { useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Slider } from '~/components/ui/Slider.tsx';
import OptionHover from './OptionHover';
import {
  HoverCard,
  HoverCardTrigger
  // HoverCardContent,
} from '~/components/ui/HoverCard.tsx';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-none dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-none dark:focus:border-transparent dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent focus:ring-[#10a37f] focus:ring-offset-0 focus:ring-opacity-100';

function Settings() {
  const [chatGptLabel, setChatGptLabel] = useState('');
  const [promptPrefix, setPromptPrefix] = useState('');
  const [temperature, setTemperature] = useState(1);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(1);
  const [freqP, setFreqP] = useState(0);
  const [presP, setPresP] = useState(0);
  const textareaRef = useRef(null);
  const inputRef = useRef(null);
  //
  return (
    <div>
      {/* <DialogDescription className="text-gray-600 dark:text-gray-300">
        Note: important instructions are often better placed in your message rather than the prefix.{' '}
        <a
          href="https://platform.openai.com/docs/guides/chat/instructing-chat-models"
          target="_blank"
          rel="noopener noreferrer"
        >
          <u>More info here</u>
        </a>
      </DialogDescription> */}
      <>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label
              htmlFor="chatGptLabel"
              className="text-right"
            >
              Custom Name
            </Label>
            <Input
              id="chatGptLabel"
              value={chatGptLabel}
              ref={inputRef}
              onChange={e => setChatGptLabel(e.target.value)}
              placeholder="Set a custom name for ChatGPT"
              className=" col-span-3 shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 dark:bg-gray-700
              dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label
              htmlFor="promptPrefix"
              className="text-right"
            >
              Prompt Prefix
            </Label>
            <TextareaAutosize
              id="promptPrefix"
              value={promptPrefix}
              onChange={e => setPromptPrefix(e.target.value)}
              placeholder="Set custom instructions. Defaults to: 'You are ChatGPT, a large language model trained by OpenAI.'"
              className={cn(defaultTextProps, 'col-span-3 flex h-10 max-h-10 w-full resize-none px-3 py-2 ')}
              onFocus={() => {
                textareaRef.current.classList.remove('max-h-10');
                textareaRef.current.classList.add('max-h-52');
              }}
              onBlur={() => {
                textareaRef.current.classList.remove('max-h-52');
                textareaRef.current.classList.add('max-h-10');
              }}
              ref={textareaRef}
            />
          </div>
          <div className="flex justify-around">
            <HoverCard>
              <HoverCardTrigger className="group/temp mr-4 flex w-full items-center justify-end gap-4">
                {/* <div className="mr-4 flex w-full items-center justify-end gap-4"> */}
                <Label
                  htmlFor="temperature"
                  className="mr-2 text-right"
                >
                  Temperature
                </Label>
                <Input
                  id="temp-int"
                  value={temperature}
                  onChange={e => setTemperature(e.target.value)}
                  className={cn(defaultTextProps, cn(optionText, 'w-10 group-hover/temp:border-gray-200'))}
                />
                {/* </div> */}
              </HoverCardTrigger>
              <OptionHover
                type="temp"
                side="right"
              />
            </HoverCard>
            {/* <div className="mr-4 flex w-full items-center justify-end gap-4"> */}
            <HoverCard>
              <HoverCardTrigger className="group/max mr-4 flex w-full items-center justify-end gap-4">
                <Label
                  htmlFor="max-tokens"
                  className="mr-2 w-full text-right"
                >
                  Max tokens
                </Label>
                <Input
                  id="max-tokens-int"
                  value={maxTokens}
                  onChange={e => setMaxTokens(e.target.value)}
                  className={cn(defaultTextProps, cn(optionText, 'w-11 group-hover/max:border-gray-200'))}
                />
              </HoverCardTrigger>
              <OptionHover
                type="max"
                side="left"
              />
            </HoverCard>
            {/* </div> */}
          </div>

          <div className="grid grid-cols-2 items-center gap-5">
            <Slider
              value={[temperature]}
              onValueChange={value => setTemperature(value)}
              max={2}
              min={0}
              step={0.01}
              className="w-full"
            />
            <Slider
              value={[maxTokens]}
              onValueChange={value => setMaxTokens(value)}
              max={2048} // should be dynamic to the currently selected model
              min={1}
              step={1}
              className="w-full"
            />
          </div>
          <div className="flex justify-around">
            <HoverCard>
              <HoverCardTrigger className="group/top mr-4 flex w-full items-center justify-end gap-4">
                <Label
                  htmlFor="top-p"
                  className="mr-2 text-right"
                >
                  Top P
                </Label>
                <Input
                  id="top-p-int"
                  value={topP}
                  onChange={e => setTopP(e.target.value)}
                  className={cn(defaultTextProps, cn(optionText, 'w-10 group-hover/top:border-gray-200'))}
                />
                <OptionHover
                  type="top-p"
                  side="right"
                />
              </HoverCardTrigger>
            </HoverCard>
            <HoverCard>
              <HoverCardTrigger className="group/freq mr-4 flex w-full items-center justify-end gap-4">
                <Label
                  htmlFor="freq-penalty"
                  className="mr-2 w-full text-right"
                >
                  Frequency Penalty
                </Label>
                <Input
                  id="freq-penalty-int"
                  value={freqP}
                  onChange={e => setFreqP(e.target.value)}
                  className={cn(defaultTextProps, cn(optionText, 'w-10 group-hover/freq:border-gray-200'))}
                />
              </HoverCardTrigger>
              <OptionHover
                type="freq"
                side="left"
              />
            </HoverCard>
          </div>
          <div className="grid grid-cols-2 items-center gap-5">
            <Slider
              value={[topP]}
              onValueChange={value => setTopP(value)}
              max={1}
              min={0}
              step={0.01}
              className="w-full"
            />
            <Slider
              value={[freqP]}
              onValueChange={value => setFreqP(value)}
              max={2}
              min={-2}
              step={0.01}
              className="w-full"
            />
          </div>
          <div className="flex justify-end">
            <HoverCard>
              <HoverCardTrigger className="group/pres mr-4 flex items-center justify-end gap-4">
                <Label
                  htmlFor="pres-penalty"
                  className="mr-2 text-right"
                >
                  Presence Penalty
                </Label>
                <Input
                  id="pres-penalty-int"
                  value={presP}
                  onChange={e => setPresP(e.target.value)}
                  className={cn(defaultTextProps, cn(optionText, 'w-10 group-hover/pres:border-gray-200'))}
                />
              </HoverCardTrigger>
              <OptionHover
                type="pres"
                side="left"
              />
            </HoverCard>
          </div>
          <div className="grid grid-cols-2 items-center gap-5">
            <Slider
              value={[presP]}
              onValueChange={value => setPresP(value)}
              max={2}
              min={0}
              step={0.01}
              className="w-full opacity-0"
            />
            <Slider
              value={[0]}
              onValueChange={value => setPresP(value)}
              max={2}
              min={-2}
              step={0.01}
              className="w-full"
            />
          </div>
        </div>
      </>
    </div>
  );
}

export default Settings;
