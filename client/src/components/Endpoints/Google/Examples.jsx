import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Button } from '~/components/ui/Button.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Plus, Minus } from 'lucide-react';
import { cn } from '~/utils/';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';

const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function Examples({ readonly, examples, setExample, addExample, removeExample, edit = false }) {
  const maxHeight = edit ? 'max-h-[233px]' : 'max-h-[350px]';
  const lang = useRecoilValue(store.lang);

  return (
    <>
      <div className={`${maxHeight} overflow-y-auto`}>
        <div id="examples-grid" className="grid gap-6 sm:grid-cols-2">
          {examples.map((example, idx) => (
            <React.Fragment key={idx}>
              {/* Input */}
              <div
                className={`col-span-${
                  examples.length === 1 ? '1' : 'full'
                } flex flex-col items-center justify-start gap-6 sm:col-span-1`}
              >
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor={`input-${idx}`} className="text-left text-sm font-medium">
                    {localize(lang, 'com_ui_input')} <small className="opacity-40">({localize(lang, 'com_endpoint_default_blank')})</small>
                  </Label>
                  <TextareaAutosize
                    id={`input-${idx}`}
                    disabled={readonly}
                    value={example?.input?.content || ''}
                    onChange={(e) => setExample(idx, 'input', e.target.value || null)}
                    placeholder="Set example input. Example is ignored if empty."
                    className={cn(
                      defaultTextProps,
                      'flex max-h-[300px] min-h-[75px] w-full resize-none px-3 py-2 ',
                    )}
                  />
                </div>
              </div>

              {/* Output */}
              <div
                className={`col-span-${
                  examples.length === 1 ? '1' : 'full'
                } flex flex-col items-center justify-start gap-6 sm:col-span-1`}
              >
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor={`output-${idx}`} className="text-left text-sm font-medium">
                    {localize(lang, 'com_endpoint_output')} <small className="opacity-40">({localize(lang, 'com_endpoint_default_blank')})</small>
                  </Label>
                  <TextareaAutosize
                    id={`output-${idx}`}
                    disabled={readonly}
                    value={example?.output?.content || ''}
                    onChange={(e) => setExample(idx, 'output', e.target.value || null)}
                    placeholder={'Set example output. Example is ignored if empty.'}
                    className={cn(
                      defaultTextProps,
                      'flex max-h-[300px] min-h-[75px] w-full resize-none px-3 py-2 ',
                    )}
                  />
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex justify-center">
        <Button
          type="button"
          className="mr-2 mt-1 h-auto items-center justify-center bg-transparent px-3 py-2 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0"
          onClick={removeExample}
        >
          <Minus className="w-[16px]" />
        </Button>
        <Button
          type="button"
          className="mt-1 h-auto items-center justify-center bg-transparent px-3 py-2 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black focus:ring-0 focus:ring-offset-0 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-white dark:focus:outline-none dark:focus:ring-offset-0"
          onClick={addExample}
        >
          <Plus className="w-[16px]" />
        </Button>
      </div>
    </>
  );
}

export default Examples;
