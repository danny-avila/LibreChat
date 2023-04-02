import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Checkbox } from '~/components/ui/Checkbox.tsx';
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
  const [showSystemMessage, setShowSystemMessage] = React.useState(false);
  const { context, setContext, systemMessage, setSystemMessage, jailbreak, setJailbreak } = props;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="context"
              className="text-left text-sm font-medium"
            >
              Context <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="context"
              value={context || ''}
              onChange={e => setContext(e.target.value || null)}
              placeholder="Set custom instructions. Defaults to: 'You are ChatGPT, a large language model trained by OpenAI.'"
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
              )}
            />
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="jailbreak"
                value={jailbreak}
                className="dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 focus:ring-opacity-20 dark:focus:ring-opacity-50 dark:focus:ring-offset-0 dark:focus:ring-gray-600"
                // onCheckedChange={setJailbreak}
                onCheckedChange={checked => {
                  setJailbreak(checked);
                  setShowSystemMessage(checked);
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
                  className="text-right text-sm font-medium mr-0 w-full"
                  style={{ opacity: showSystemMessage ? '1' : '0' }}
                >
                  System Message <small className="opacity-40">(default: Sydney)</small>
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
                  value={systemMessage || ''}
                  onChange={e => setSystemMessage(e.target.value || null)}
                  placeholder="Set custom instructions. Defaults to: 'You are ChatGPT, a large language model trained by OpenAI.'"
                  className={cn(
                    defaultTextProps,
                    'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
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
