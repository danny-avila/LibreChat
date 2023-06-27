import React from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import useDocumentTitle from '~/hooks/useDocumentTitle';
// import SunIcon from '../svg/SunIcon';
// import LightningIcon from '../svg/LightningIcon';
// import CautionIcon from '../svg/CautionIcon';
import store from '~/store';
import { useGetStartupConfig } from '~/data-provider';
import { useGetRecentConversations } from '~/data-provider';

export default function Landing() {
  const { data: config } = useGetStartupConfig();
  const setText = useSetRecoilState(store.text);
  const conversation = useRecoilValue(store.conversation);
  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { title = 'New Chat' } = conversation || {};

  // Get recent conversations
  const RecentConversations = useGetRecentConversations();
  // const data = RecentConversations.data;

  useDocumentTitle(title);

  // const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
  //   e.preventDefault();
  //   const { innerText } = e.target as HTMLButtonElement;
  //   const quote = innerText.split('"')[1].trim();
  //   setText(quote);
  // };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
      <div className="w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
        <h1
          id="landing-title"
          className="mb-10 ml-auto mr-auto mt-6 flex items-center justify-center gap-2 text-center text-4xl font-semibold sm:mb-16 md:mt-[10vh]"
        >
          {config?.appTitle || 'LibreChat'}
        </h1>
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
