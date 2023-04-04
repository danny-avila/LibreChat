import React, { useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Checkbox } from '~/components/ui/Checkbox.tsx';
import Dropdown from '~/components/ui/Dropdown';
import { cn } from '~/utils/';
// import ModelDropDown from '../../ui/ModelDropDown';
// import { Slider } from '~/components/ui/Slider.tsx';
// import OptionHover from './OptionHover';
// import { HoverCard, HoverCardTrigger } from '~/components/ui/HoverCard.tsx';
const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent focus:ring-[#10a37f] focus:ring-offset-0 focus:ring-opacity-100 hover:bg-gray-800/10 dark:hover:bg-white/10 focus:bg-gray-800/10 dark:focus:bg-white/10 transition-colors';

function Settings(props) {
  const { readonly, context, systemMessage, jailbreak, toneStyle, setOption } = props;
  const showSystemMessage = jailbreak;
  const setContext = setOption('context');
  const setSystemMessage = setOption('systemMessage');
  const setJailbreak = setOption('jailbreak');

  // console.log('data', data);

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Dropdown
              id="toneStyle-dropdown"
              value={toneStyle}
              onChange={setOption('toneStyle')}
              options={['creative', 'fast', 'balanced', 'precise']}
              className={cn(
                defaultTextProps,
                'flex h-10 max-h-10 w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
              containerClassName="flex w-full resize-none"
            />
            <Label
              htmlFor="context"
              className="text-left text-sm font-medium"
            >
              Context <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="context"
              disabled={readonly}
              value={context || ''}
              onChange={e => setContext(e.target.value || null)}
              placeholder="Bing can use up to 7k tokens for 'context', text that it can reference per 1 conversation. The specific limit is not known but may run into errors exceeding 7k tokens"
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2'
              )}
            />
            <small className='mb-5'>{'Token count: 1200 (work in progress)'}</small>
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="jailbreak"
                disabled={readonly}
                checked={jailbreak}
                className="focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
                // onCheckedChange={setJailbreak}
                onCheckedChange={checked => {
                  setJailbreak(checked);
                  // setShowSystemMessage(checked);
                }}
              />
              <label
                htmlFor="jailbreak"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
              >
                Jailbreak
              </label>
              <Label
                htmlFor="systemMessage"
                className="mr-0 w-full text-right text-sm font-medium"
                style={{ opacity: showSystemMessage ? '1' : '0' }}
              >
                <a
                  href="https://github.com/danny-avila/chatgpt-clone/blob/main/client/defaultSystemMessage.md"
                  target="_blank"
                  className="text-blue-500 transition-colors duration-200 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-500"
                >
                  System Message
                </a>{' '}
                <small className="opacity-40">(default: Sydney)</small>
              </Label>
            </div>
            {showSystemMessage && (
              <>
                {/* <Label
                  htmlFor="systemMessage"
                  className="text-left text-sm font-medium"
                >
                  System Message <small className="opacity-40">(default: blank)</small>
                </Label> */}
                <TextareaAutosize
                  id="systemMessage"
                  disabled={readonly}
                  value={systemMessage || ''}
                  onChange={e => setSystemMessage(e.target.value || null)}
                  placeholder="WARNING: Misuse of this feature can get you BANNED from using Bing! Click on 'System Message' for full instructions and the default message if omitted, which is the 'Sydney' preset that is considered safe."
                  className={cn(
                    defaultTextProps,
                    'flex max-h-[300px] min-h-[148px] w-full resize-none px-3 py-2 '
                  )}
                />
              </>
            )}
          </div>
          {/* <HoverCard>
            <HoverCardTrigger className="grid w-full items-center gap-2"> 
            </HoverCardTrigger>
            <OptionHover
              type="temp"
              side="left"
            />
          </HoverCard> */}
        </div>
      </div>
    </>
  );
}

export default Settings;
