import { useState } from 'react';
import { Label } from '~/components/ui/Label';
import SelectDropDown from '../../../ui/SelectDropDown';
import EssayTemplate from './EssayTemplate';
import { cn } from '~/utils';

/*
作者职位、写作水平、字数、主题、布局、风格、引文、读者
https://www.griproom.com/fun/how-to-use-chat-gpt-to-write-an-essay
https://www.griproom.com/fun/how-to-write-better-prompts-for-chat-gpt
*/
function getTemplate(type: string) {
  switch (type) {
    default: return EssayTemplate();

    case ('作文'): return EssayTemplate();
  }
}

function WritingAssistant() {
  // Essay basic bundle
  const [type, setType] = useState<string>('作文');
  const template = getTemplate(type);

  const defaultTextProps =
    'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const getPromptText = template.getPromptText;
  const setExample = template.setExample;
  const restoreFields = template.restoreFields;

  const WidgetLayout = () => {
    return(
      <div className="h-[490px] overflow-y-auto md:h-[400px]">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="col-span-1 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-y-2">
              <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
                写作类型 <small className="opacity-40">(默认值: 作文)</small>
              </Label>
              <SelectDropDown
                title={''}
                value={type}
                setValue={(value: string) => setType(value)}
                availableValues={['作文']}
                disabled={false}
                className={cn(
                  defaultTextProps,
                  'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
                containerClassName="flex w-full resize-none"
                subContainerClassName=''
              />
              {template.SubType()}
            </div>
            {template.LayoutLeft()}
          </div>
          <div className="col-span-1 flex flex-col items-center justify-start gap-6">
            {template.LayoutRight()}
          </div>
        </div>
      </div>
    );
  }

  return({ WidgetLayout, getPromptText, setExample, restoreFields });
}

export default WritingAssistant;