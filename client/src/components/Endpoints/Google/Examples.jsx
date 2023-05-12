import TextareaAutosize from 'react-textarea-autosize';
import { Label } from '~/components/ui/Label.tsx';
import { cn } from '~/utils/';
const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function Examples(props) {
  const { readonly, examples, setExample } = props;

  return (
    <>
      <div id="examples-grid" className="grid gap-6 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="input-0"
              className="text-left text-sm font-medium"
            >
              Input <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="input-0"
              disabled={readonly}
              value={examples?.[0]?.input || ''}
              onChange={e => setExample(0, 'input', e.target.value || null)}
              placeholder="Set example input. Defaults to None"
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
              )}
            />
          </div>
        </div>
        <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-2">
            <Label
              htmlFor="output-0"
              className="text-left text-sm font-medium"
            >
              Output <small className="opacity-40">(default: blank)</small>
            </Label>
            <TextareaAutosize
              id="output-0"
              disabled={readonly}
              value={examples?.[0]?.output || ''}
              onChange={e => setExample(0, 'output', e.target.value || null)}
              placeholder={`Set example output. Defaults to None`}
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2 '
              )}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default Examples;
