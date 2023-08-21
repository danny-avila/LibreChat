import { useEffect, useState } from 'react';
import { Label, SelectDropDown } from '~/components/ui';
import { cn } from '~/utils';
import { MessagesSquared } from '~/components/svg';
import EndpointOptionsPopover from '~/components/Endpoints/EndpointOptionsPopover';
import { useRecoilState } from 'recoil';
import TextareaAutosize from 'react-textarea-autosize';
import store from '~/store';

type Cache = {
  lang: string,
  type: string,
  topic: string,
}

function CodingAssistant() {
  const [lang, setLang] = useState<string>('Python');
  const [type, setType] = useState<string>('代码生成');
  const [topic, setTopic] = useState<string>('');
  const [showExample, setShowExample] = useState<boolean>(false);
  const [widget, setWidget] = useRecoilState(store.widget);
  const [inputTitle, setInputTitle] = useState<string>('用途');
  const [text, setText] = useRecoilState(store.text);
  const [cache, setCache] = useState<Cache>({
    lang: '',
    type: '',
    topic: ''
  });

  const defaultTextProps =
    'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  const setTextHandler = () => {
    if (type === '代码生成') {
      setText(`生成一段${lang}代码，用途是：${topic}`);
    } else if (type === '代码优化') {
      setText(`用${lang}优化下面这段代码：\n${topic}`);
    } else if (type === '错误信息') {
      setText(`生成一段${lang}错误信息，主题是：${topic}`);
    }
  };
  const showExampleHandler = () => {
    if (showExample) {
      setLang(cache.lang);
      setType(cache.type);
      setTopic(cache.topic);
    } else {
      setCache({
        lang: lang,
        type: type,
        topic: topic
      });
      setLang('Python');
      setType('代码生成');
      setTopic('归并排序');
    }
    setShowExample(!showExample);
  };

  const content = () => {
    return(
      <div className="pb-12 max-h-[450px] h-[60vh] overflow-y-auto md:h-[450px]">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="col-span-1 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-y-2">
              <SelectDropDown
                title={'语言'}
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
            <div className="grid w-full items-center gap-y-2">
              <SelectDropDown
                title={'类型'}
                value={type}
                setValue={(value: string) => setType(value)}
                availableValues={['代码生成', '代码优化', '错误信息']}
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
            <div className="grid w-full items-center gap-1">
              <Label htmlFor="context" className="text-left text-sm font-medium">
                { inputTitle }
              </Label>
              <TextareaAutosize
                id="topic"
                title={ inputTitle }
                disabled={false}
                value={topic || ''}
                onChange={(e) => setTopic(e.target.value || '')}
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

  useEffect(() => {
    if (type === '代码生成') {
      setInputTitle('代码用途');
    } else if (type === '代码优化') {
      setInputTitle('原代码');
    } else if (type === '错误信息') {
      setInputTitle('主题');
    }
  }, [type]);

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