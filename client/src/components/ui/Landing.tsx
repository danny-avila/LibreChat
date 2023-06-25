import React from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import SunIcon from '../svg/SunIcon';
import LightningIcon from '../svg/LightningIcon';
import CautionIcon from '../svg/CautionIcon';
import store from '~/store';
import { useGetStartupConfig } from '~/data-provider';

export default function Landing() {
  const { data: config } = useGetStartupConfig();
  const setText = useSetRecoilState(store.text);
  const conversation = useRecoilValue(store.conversation);
  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { title = 'New Chat' } = conversation || {};

  useDocumentTitle(title);

  const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const { innerText } = e.target as HTMLButtonElement;
    const quote = innerText.split('"')[1].trim();
    setText(quote);
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
      <div className="w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
        <h1
          id="landing-title"
          className="mb-10 ml-auto mr-auto mt-6 flex items-center justify-center gap-2 text-center text-4xl font-semibold sm:mb-16 md:mt-[10vh]"
        >
          {config?.appTitle || 'AITok Chat'}
        </h1>
        <div className="items-start gap-3.5 text-center md:flex">
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <SunIcon />
              {navigator.languages[0]==='zh-CN'? "样例":"Examples" }
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;{navigator.languages[0]==='zh-CN'? "用简单的术语解释量子计算":"Explain quantum computing in simple terms"}&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;{navigator.languages[0]==='zh-CN'? "对10岁的生日有什么创意吗？":"Got any creative ideas for a 10 year old&apos;s birthday?"}&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;{navigator.languages[0]==='zh-CN'? "如何在Javascript中发出HTTP请求？":"How do I make an HTTP request in Javascript?"}&quot; →
              </button>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <LightningIcon />
              {navigator.languages[0]==='zh-CN'? "能力":"Capabilities"}
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "记住用户在对话中之前所说的话":"Remembers what user said earlier in the conversation"}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "允许用户提供后续更正":"Allows user to provide follow-up corrections"}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "受过拒绝不当请求的培训":"Trained to decline inappropriate requests"}
              </li>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <CautionIcon />
              {navigator.languages[0]==='zh-CN'? "限制":"Limitations"}
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "可能偶尔会产生不正确的信息":"May occasionally generate incorrect information"}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "可能偶尔会产生有害指令或有偏见的内容":"May occasionally produce harmful instructions or biased content"}
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                {navigator.languages[0]==='zh-CN'? "对2021年后的世界和事件了解有限":"Limited knowledge of world and events after 2021"}
              </li>
            </ul>
          </div>
        </div>
        {/* {!showingTemplates && (
          <div className="mt-8 mb-4 flex flex-col items-center gap-3.5 md:mt-16">
            <button
              onClick={showTemplates}
              className="btn btn-neutral justify-center gap-2 border-0 md:border"
            >
              <ChatIcon />
              Show Prompt Templates
            </button>
          </div>
        )}
        {!!showingTemplates && <Templates showTemplates={showTemplates}/>} */}
        {/* <div className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:bg-gray-800 md:h-48" /> */}
      </div>
    </div>
  );
}
