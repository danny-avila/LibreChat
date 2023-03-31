import React, { useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Slider } from '~/components/ui/Slider.tsx';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-none dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-none dark:focus:border-transparent dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

const optionText = 'p-0 shadow-none text-right pr-1 h-8';

function Settings() {
  const [chatGptLabel, setChatGptLabel] = useState('');
  const [promptPrefix, setPromptPrefix] = useState('');
  const [temperature, setTemperature] = useState(1);
  const [maxLength, setMaxLength] = useState(2048);
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
          <div className="flex w-full items-center justify-end mr-4 gap-4">
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
              placeholder="1.0"
              className={cn(defaultTextProps, `w-9 ${optionText}`)}
            />
          </div>
          <div className="flex w-full items-center justify-end mr-4 gap-4">
            <Label
              htmlFor="max-length"
              className="mr-2 w-full text-right"
            >
              Max. length
            </Label>
            <Input
              id="max-length-int"
              value={maxLength}
              onChange={e => setMaxLength(e.target.value)}
              placeholder="1.0"
              className={cn(defaultTextProps, `w-11 ${optionText}`)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 items-center gap-4">
          <Slider
            defaultValue={[1]}
            onValueChange={value => setTemperature(value)}
            max={2}
            min={0}
            step={0.01}
            className="w-full"
          />
          <Slider
            defaultValue={[2048]}
            onValueChange={value => setMaxLength(value)}
            max={2048}
            min={1}
            step={1}
            className="w-full"
          />
        </div>

        <div className="flex justify-around">
          <div className="flex w-full items-center justify-end mr-4 gap-4">
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
              placeholder="1.0"
              className={cn(defaultTextProps, `w-9 ${optionText}`)}
            />
          </div>
          <div className="flex w-full items-center justify-end mr-4 gap-4">
            <Label
              htmlFor="freq-penalty"
              className="mr-2 w-full text-right"
            >
              Freq. Penalty
            </Label>
            <Input
              id="freq-penalty-int"
              value={freqP}
              onChange={e => setFreqP(e.target.value)}
              placeholder="1.0"
              className={cn(defaultTextProps, `w-9 ${optionText}`)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 items-center gap-4">
          <Slider
            defaultValue={[0]}
            onValueChange={value => setTopP(value)}
            max={2}
            min={0}
            step={0.01}
            className="w-full"
          />
          <Slider
            defaultValue={[0]}
            onValueChange={value => setFreqP(value)}
            max={2}
            min={0}
            step={0.01}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

export default Settings;
