import SelectDropDown from '../../../ui/SelectDropDown';
import { Label } from '~/components/ui/Label';
import TextareaAutosize from 'react-textarea-autosize';
import * as Switch from '@radix-ui/react-switch';
import { useState } from 'react';
import { cn } from '~/utils/';

type Cache = {
  subType: string,
  level: string,
  wordCount: string,
  paragraphCount: string,
  easyMode: boolean,
  topic: string,
  paraTopic: string[],
  refAuthor: string,
  refTitle: string,
  refType: string
}

function getParagraphFields({ paragraphCount, paraTopic, setParaTopic }) {
  const numOfParagraph = Number(paragraphCount);
  const defaultTextProps =
  	'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';
  const rows = new Array(numOfParagraph);

  for (let i = 0; i < numOfParagraph; i++) {
    rows.push(<input className={cn(
      defaultTextProps,
      'flex max-h-[300px] h-[30px] w-full resize-none px-3 py-2'
    )}
    key={`paragraph${i + 1}`}
    value={paraTopic[i]}
    placeholder={`段落${i + 1}`}
    title={`段落${i + 1}`}
    onChange={
      (e) => {
        const newTopics = structuredClone(paraTopic);
        newTopics[i] = e.target.value || '';
        setParaTopic(newTopics)
      }
    }
    />
    )
  }

  return (
    <div className='flex flex-col gap-1 overflow-auto h-[100px]'>
      {rows}
    </div>
  );
}

export default function EssayTemplate() {
  const defaultTextProps =
    'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';
  const selectDropDownStyle = cn(
    defaultTextProps,
    'flex w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
  );
  const inputStyle = cn(
    defaultTextProps,
    'flex max-h-[300px] min-h-[25px] w-full resize-none px-3 py-2'
  );
  const defaultSubType: string = '全文';
  const defaultAuthor: string = '高中生';
  const defaultWordCount: string = '500';
  const defaultParagraphCount: string = '3'

  const [level, setLevel] = useState<string>(defaultAuthor);
  const [subType, setSubType] = useState<string>(defaultSubType);
  const [wordCount, setWordCount] = useState<string>(defaultWordCount);
  const [topic, setTopic] = useState<string>('');
  const [paragraphCount, setParagraphCount] = useState<string>(defaultParagraphCount);
  const [easyMode, setEasyMode] = useState<boolean>(true);
  const [paraTopic, setParaTopic] = useState<string[]>(new Array(Number(paragraphCount)).fill(''));
  const [refType, setRefType] = useState<string>('');
  const [refAuthor, setRefAuthor] = useState<string>('');
  const [refTitle, setRefTitle] = useState<string>('');
  const [cache, setCache] = useState<Cache>({
    subType: defaultSubType,
    level: defaultAuthor,
    wordCount: defaultWordCount,
    paragraphCount: defaultParagraphCount,
    easyMode: true,
    topic: '',
    paraTopic: [],
    refAuthor: '',
    refTitle: '',
    refType: ''
  });

  const paragraphFields = getParagraphFields({ paragraphCount, paraTopic, setParaTopic });

  const SubType = () => {
    return(
      <SelectDropDown
        title={''}
        value={subType}
        setValue={(value: string) => setSubType(value)}
        availableValues={['全文', '文章段落']}
        disabled={false}
        className={selectDropDownStyle}
        containerClassName="flex w-full resize-none"
        subContainerClassName=''
      />
    );
  }

  const Author =
    <div className="grid w-full items-center gap-y-2">
      <Label htmlFor="toneStyle-dropdown" className="text-left text-sm font-medium">
        写作水平 <small className="opacity-40">(默认值: 高中生)</small>
      </Label>
      <SelectDropDown
        title={''}
        value={level}
        setValue={(value: string) => setLevel(value)}
        availableValues={['小学三年级', '小学六年级', '初中生', '高中生', '本科生', '学士', '硕士', '博士']}
        disabled={false}
        className={selectDropDownStyle}
        containerClassName="flex w-full resize-none"
        subContainerClassName=''
      />
    </div>

  const WordCountInput =
    <div className="grid w-full items-center gap-2">
      <Label htmlFor="context" className="text-left text-sm font-medium">
        字数 <small className="opacity-40">(默认值: 500)</small>
      </Label>
      <input
        id='wordCount'
        type="number"
        min={'1'}
        max={'500'}
        value={wordCount || 0}
        onChange={(e) => setWordCount(e.target.value || '0')}
        className={inputStyle}
      />
    </div>

  const FullEssayTopicInputs =
    <div className="grid w-full items-center gap-2">
      <div className='flex flex-row gap-6'>
        <Label htmlFor="context" className="text-left text-sm font-medium">
          主题 <small className="opacity-40">(默认值: 空白)</small>
        </Label>
        <div className='flex flex-row gap-2 items-center'>
          <Switch.Root
            className="w-[30px] h-[16px] bg-blue-500 rounded-full relative data-[state=checked]:bg-violet-700 outline-none cursor-default"
            id="easy-mode-switch"
            checked={!easyMode}
            onCheckedChange={(prev) => setEasyMode(!prev)}
          >
            <Switch.Thumb className="block w-[14px] h-[14px] bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[13px]" />
          </Switch.Root>
          <Label id="easy-mode-text" htmlFor="context" className="text-left text-sm font-medium">
            {easyMode ? '简约' : '微调'}
          </Label>
        </div>
      </div>
      {
        easyMode ? <TextareaAutosize
          id="essay-topic"
          disabled={false}
          value={topic || ''}
          onChange={(e) => setTopic(e.target.value || '')}
          className={cn(
            defaultTextProps,
            'flex max-h-[300px] min-h-[100px] w-full resize-none px-3 py-2'
          )}
        /> : paragraphFields
      }
    </div>

  const EssayParagraphInputs =
    <div className="grid w-full items-center gap-1">
      <Label htmlFor="context" className="text-left text-sm font-medium">
        主题 <small className="opacity-40">(默认值: 空白)</small>
      </Label>
      <TextareaAutosize
        id="essay-topic"
        title='文章主题'
        placeholder='文章主题'
        disabled={false}
        value={topic || ''}
        onChange={(e) => setTopic(e.target.value || '')}
        className={cn(
          defaultTextProps,
          'flex max-h-[300px] min-h-[50px] w-full resize-none px-3 py-2'
        )}
      />
      <TextareaAutosize
        id="essay-paragraph-topic"
        title='段落主题'
        placeholder='段落主题'
        disabled={false}
        value={paraTopic[0] || ''}
        onChange={
          (e) => {
            const newTopics = structuredClone(paraTopic);
            newTopics[0] = e.target.value || '';
            setParaTopic(newTopics)
          }
        }
        className={cn(
          defaultTextProps,
          'flex max-h-[300px] min-h-[50px] w-full resize-none px-3 py-2'
        )}
      />
    </div>

  const ParagraphCountInput =
    <div className="grid w-full items-center gap-2">
      <Label htmlFor="context" className="text-left text-sm font-medium">
        段落 <small className="opacity-40">(默认值: 3)</small>
      </Label>
      <input
        id='paragraphCount'
        type="number"
        min='1'
        max="5"
        value={paragraphCount || 0}
        onChange={(e) => setParagraphCount(e.target.value || '0')}
        className={inputStyle}
        disabled={(subType === '文章段落')}
      />
      {(subType === '全文') && FullEssayTopicInputs}
      {(subType === '文章段落') && EssayParagraphInputs}
    </div>

  const ReferenceText =
    <div className="grid w-full items-center gap-2">
      <Label htmlFor="context" className="text-left text-sm font-medium">
        文本引用 <small className="opacity-40">(如若引用文本，须填写文本类型以及其名字与作者)</small>
      </Label>
      <input
        id='refTitleInput'
        title='类型'
        placeholder='类型'
        value={refType || ''}
        onChange={(e) => setRefType(e.target.value || '')}
        className={inputStyle}
      />
      <input
        id='refTitleInput'
        title='名字'
        placeholder='名字'
        value={refTitle || ''}
        onChange={(e) => setRefTitle(e.target.value || '')}
        className={inputStyle}
      />
      <input
        id='refAuthorInput'
        title='作者'
        placeholder='作者'
        value={refAuthor || ''}
        onChange={(e) => setRefAuthor(e.target.value || '')}
        className={inputStyle}
      />
    </div>

  const LayoutLeft = () => {
    return(
      <>
        {Author}
        {WordCountInput}
      </>
    );
  }

  const LayoutRight = () => {
    return(
      <>
        {ParagraphCountInput}
        {ReferenceText}
      </>
    );
  }

  function getRefText() {
    if (refAuthor && refType && refTitle) return(`引用${refAuthor}的${refType}《${refTitle}》。`);
    else return('');
  }

  function getEssayPrompt() {
    if (easyMode) {
      return(
        `以${level}的水平写一篇${wordCount}字的作文。作文要分成${paragraphCount}个段落，主题是：${topic}。` +
          getRefText()
      );
    } else {
      const topics: string[] = [];

      topics.push(`以${level}的水平写一篇${wordCount}字的作文。作文要分成${paragraphCount}个段落，第1段的主题是：${paraTopic[0]}。`);

      for (let i = 1; i < Number(paragraphCount); i++) {
        topics.push(`第${i + 1}段的主题是${paraTopic[i]}。`);
      }

      return (topics.join('') + getRefText());
    }
  }

  function getEssayParagraphPrompt() {
    return(
      `以${level}的水平写一篇${wordCount}字的作文段落。作文主题是：${topic}。段落的主题是：${paraTopic[0]}。` +
        getRefText()
    );
  }

  const getPromptText = () => {
    switch (subType) {
      default: return getEssayPrompt();
      case ('全文'): return getEssayPrompt();
      case ('文章段落'): return getEssayParagraphPrompt();
    }
  }

  const setExample = () => {
    setCache({
      subType: subType,
      level: level,
      wordCount: wordCount,
      paragraphCount: paragraphCount,
      easyMode: easyMode,
      topic: topic,
      paraTopic: paraTopic,
      refAuthor: refAuthor,
      refTitle: refTitle,
      refType: refType
    });
    setSubType('全文');
    setLevel('高中生');
    setWordCount('500');
    setParagraphCount('3');
    setEasyMode(true);
    setTopic('AI如何造福或祸害了人类');
    setRefAuthor('壹知识露哥');
    setRefTitle('AI技术欺骗人类，霍金：不要滥用，否则对人类产生灾难性影响');
    setRefType('百度帖子');
  }

  const restoreFields = () => {
    setSubType(cache.subType);
    setLevel(cache.level);
    setWordCount(cache.wordCount);
    setParagraphCount(cache.paragraphCount);
    setEasyMode(cache.easyMode);
    setTopic(cache.topic);
    setParaTopic(cache.paraTopic);
    setRefAuthor(cache.refAuthor);
    setRefTitle(cache.refTitle);
    setRefType(cache.refType);
  }

  return({ SubType, LayoutLeft, LayoutRight, getPromptText, setExample, restoreFields })
}
