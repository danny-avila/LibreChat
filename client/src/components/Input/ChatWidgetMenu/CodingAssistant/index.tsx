import { useState } from 'react';
import { Label, SelectDropDown } from '~/components/ui';
import { cn } from '~/utils';
import { MessagesSquared } from '~/components/svg';
import EndpointOptionsPopover from '~/components/Endpoints/EndpointOptionsPopover';
import { useRecoilState } from 'recoil';
import store from '~/store';

function CodingAssistant() {
  const [lang, setLang] = useState<string>('Python');
  const [type, setType] = useState<string>('代码生成');
  const [topic, setTopic] = useState<string>('');
  const [showExample, setShowExample] = useState<boolean>(false);
  const [widget, setWidget] = useRecoilState(store.widget);

  const defaultTextProps =
    'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const setTextHandler = () => {};
  const showExampleHandler = () => {};

  const content = () => {
    return(
      <div className="h-[490px] overflow-y-auto md:h-[450px]">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="col-span-1 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-y-2">
              <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
                语言
              </Label>
              <SelectDropDown
                title={''}
                value={lang}
                setValue={(value: string) => setLang(value)}
                availableValues={['Python', 'Javascript', 'Java', 'C#', 'C++', 'Swift', 'HTML']}
                disabled={false}
                className={cn(
                  defaultTextProps,
                  'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
                containerClassName="flex w-full resize-none"
                subContainerClassName=''
              />
            </div>
          </div>
          <div className="col-span-1 flex flex-col items-center justify-start gap-6">
          </div>
        </div>
      </div>
    );
  }

  return(
    <EndpointOptionsPopover
      content={
        <div className="px-4 py-4">
          { content() }
        </div>
      }
      widget={true}
      visible={ widget === 'ca' }
      saveAsPreset={ setTextHandler }
      switchToSimpleMode={() => {
        setWidget('');
      }}
      additionalButton={{
        label: (showExample ? '恢复' : '示例'),
        handler: showExampleHandler,
        icon: <MessagesSquared className="mr-1 w-[14px]" />
      }}
    />
  );
}

export default CodingAssistant;