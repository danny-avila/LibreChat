import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Button } from '~/components/ui/Button.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Plus, Minus } from 'lucide-react';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function Examples({ readonly, examples, setExample, addExample, removeExample }) {
  return (
    <>
      <div className="max-h-[600px] overflow-y-auto">
        <div
          id="examples-grid"
          className="grid gap-6 sm:grid-cols-2"
        >
          {examples.map((example, idx) => (
            <React.Fragment key={idx}>
              {/* Input */}
              <div
                className={`col-span-${
                  examples.length === 1 ? '1' : 'full'
                } flex flex-col items-center justify-start gap-6 sm:col-span-1`}
              >
                <div className="grid w-full items-center gap-2">
                  <Label
                    htmlFor={`input-${idx}`}
                    className="text-left text-sm font-medium"
                  >
                    Input <small className="opacity-40">(default: blank)</small>
                  </Label>
                  <TextareaAutosize
                    id={`input-${idx}`}
                    disabled={readonly}
                    value={example?.input || ''}
                    onChange={e => setExample(idx, 'input', e.target.value || null)}
                    placeholder="Set example input. Defaults to None"
                    className={cn(
                      defaultTextProps,
                      'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
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
                  <Label
                    htmlFor={`output-${idx}`}
                    className="text-left text-sm font-medium"
                  >
                    Output <small className="opacity-40">(default: blank)</small>
                  </Label>
                  <TextareaAutosize
                    id={`output-${idx}`}
                    disabled={readonly}
                    value={example?.output || ''}
                    onChange={e => setExample(idx, 'output', e.target.value || null)}
                    placeholder={`Set example output. Defaults to None`}
                    className={cn(
                      defaultTextProps,
                      'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
                    )}
                  />
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <Button
        type="button"
        className="h-auto justify-center bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
        onClick={removeExample}
      >
        <Minus className="mr-1 w-[14px]" />
      </Button>
      <Button
        type="button"
        className="h-auto justify-center bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
        onClick={addExample}
      >
        <Plus className="mr-1 w-[14px]" />
      </Button>
    </>
  );
}

export default Examples;
