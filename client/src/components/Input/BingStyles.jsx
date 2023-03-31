import React, { useState, useEffect, forwardRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs.tsx';
import { useRecoilValue, useRecoilState } from 'recoil';
import { cn } from '../../utils';

import store from '~/store';

function BingStyles(props, ref) {
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId, jailbreak, toneStyle } = conversation;
  const messages = useRecoilValue(store.messages);

  const isBing = endpoint === 'bingAI';

  const show = isBing && (!conversationId || messages?.length === 0 || props.show);
  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(defaultClasses, 'font-medium data-[state=active]:text-white text-xs text-white');

  const selectedClass = val => val + '-tab ' + defaultSelected;

  const changeHandler = value => {
    setConversation(prevState => ({ ...prevState, toneStyle: value }));
  };

  return (
    <Tabs
      defaultValue={toneStyle}
      className={`bing-styles mb-1 shadow-md ${show ? 'show' : ''}`}
      onValueChange={changeHandler}
      ref={ref}
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
  );
}

export default forwardRef(BingStyles);
