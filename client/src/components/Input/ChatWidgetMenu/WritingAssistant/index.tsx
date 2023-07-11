import { useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Label } from '~/components/ui/Label';
import SelectDropDown from '../../../ui/SelectDropDown';
import { cn } from '~/utils/';

/*
作者职位、写作水平、字数、主题、布局、风格、引文、读者
*/
function WritingAssistant() {
  // Essay basic bundle
  const [level, setLevel] = useState<string>('学士');
  const [wordCount, setWordCount] = useState<string>('500');
  const [topic, setTopic] = useState<string>('');

  const defaultTextProps =
  	'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  return (
	  <div className="h-[490px] overflow-y-auto md:h-[400px]">
      <div className="grid gap-6 sm:grid-cols-2">
	      <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          <div className="grid w-full items-center gap-y-2">
            <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
              写作水平 <small className="opacity-40">(默认值: 学士)</small>
            </Label>
            <SelectDropDown
              id='level'
              title={''}
              value={level}
              setValue={(value: string) => setLevel(value)}
              availableValues={['小学三年级', '小学六年级', '初中生', '高中生', '本科生', '学士', '硕士', '博士']}
              disabled={false}
              className={cn(
                defaultTextProps,
                'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
              )}
              containerClassName="flex w-full resize-none"
              subContainerClassName=''
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="context" className="text-left text-sm font-medium">
              字数 <small className="opacity-40">(默认值: 500)</small>
            </Label>
            <input
              type="number"
              value={wordCount || 0}
              onChange={(e) => setWordCount(e.target.value || '0')}
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[25px] w-full resize-none px-3 py-2'
              )}
            />
          </div>
          <div className="grid w-full items-center gap-2">
            <Label htmlFor="context" className="text-left text-sm font-medium">
              主题 <small className="opacity-40">(默认值: 空白)</small>
            </Label>
            <TextareaAutosize
              id="context"
              disabled={false}
              value={topic || ''}
              onChange={(e) => setTopic(e.target.value || '')}
              placeholder="Bing can use up to 7k tokens for 'context', which it can reference for the conversation. The specific limit is not known but may run into errors exceeding 7k tokens"
              className={cn(
                defaultTextProps,
                'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2'
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WritingAssistant;