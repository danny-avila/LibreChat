import React from 'react';
import { useRecoilValue, useRecoilState } from 'recoil';
import { cn } from '~/utils';
import { Tabs, TabsList, TabsTrigger } from '../../ui/Tabs.tsx';

import store from '~/store';

function BingAIOptions() {
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId } = conversation;

  if (endpoint !== 'bingAI') return null;
  if (conversationId !== 'new') return null;

  const changeHandler = value => {
    setConversation(prevState => ({ ...prevState, toneStyle: value }));
  };

  const { toneStyle } = conversation;

  const cardStyle =
    'shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';
  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');
  const selectedClass = val => val + '-tab ' + defaultSelected;

  return (
    <div className={' flex w-full items-center justify-center gap-2'}>
      <Tabs
        value={toneStyle}
        className={
          cardStyle +
          ' flex h-[40px] items-center justify-center px-0 hover:bg-slate-50 dark:hover:bg-gray-600'
        }
        onValueChange={changeHandler}
      >
        <TabsList className="bg-white/[.60] dark:bg-gray-700">
          <TabsTrigger
            value="creative"
            className={`${toneStyle === 'creative' ? selectedClass('creative') : defaultClasses}`}
          >
            {'Creative'}
          </TabsTrigger>
          <TabsTrigger
            value="fast"
            className={`${toneStyle === 'fast' ? selectedClass('fast') : defaultClasses}`}
          >
            {'Fast'}
          </TabsTrigger>
          <TabsTrigger
            value="balanced"
            className={`${toneStyle === 'balanced' ? selectedClass('balanced') : defaultClasses}`}
          >
            {'Balanced'}
          </TabsTrigger>
          <TabsTrigger
            value="precise"
            className={`${toneStyle === 'precise' ? selectedClass('precise') : defaultClasses}`}
          >
            {'Precise'}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

export default BingAIOptions;
