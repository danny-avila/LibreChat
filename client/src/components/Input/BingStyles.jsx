import React, { useState, useEffect, forwardRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs.tsx';
import { useRecoilValue, useRecoilState } from 'recoil';
// import { setConversation } from '~/store/convoSlice';

import store from '~/store';

function BingStyles(props, ref) {
  const [value, setValue] = useState('fast');

  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { model, conversationId } = conversation;
  const messages = useRecoilValue(store.messages);

  const isBing = model === 'bingai' || model === 'sydney';
  useEffect(() => {
    if ((model === 'bingai' && !conversationId) || model === 'sydney') {
      setConversation(prevState => ({ ...prevState, toneStyle: value }));
    }
  }, [conversationId, model, value]);

  const show = isBing && (!conversationId || messages?.length === 0 || props.show);
  const defaultClasses = 'p-2 rounded-md font-normal bg-white/[.60] dark:bg-gray-700 text-black';
  const defaultSelected = defaultClasses + 'font-medium data-[state=active]:text-white';

  const selectedClass = val => val + '-tab ' + defaultSelected;

  const changeHandler = value => {
    setValue(value);
    setConversation(prevState => ({ ...prevState, toneStyle: value }));
  };
  return (
    <Tabs
      defaultValue={value}
      className={`bing-styles mb-1 shadow-md ${show ? 'show' : ''}`}
      onValueChange={changeHandler}
      ref={ref}
    >
      <TabsList className="bg-white/[.60] dark:bg-gray-700">
        <TabsTrigger
          value="creative"
          className={`${value === 'creative' ? selectedClass(value) : defaultClasses}`}
        >
          {'Creative'}
        </TabsTrigger>
        <TabsTrigger
          value="fast"
          className={`${value === 'fast' ? selectedClass(value) : defaultClasses}`}
        >
          {'Fast'}
        </TabsTrigger>
        <TabsTrigger
          value="balanced"
          className={`${value === 'balanced' ? selectedClass(value) : defaultClasses}`}
        >
          {'Balanced'}
        </TabsTrigger>
        <TabsTrigger
          value="precise"
          className={`${value === 'precise' ? selectedClass(value) : defaultClasses}`}
        >
          {'Precise'}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export default forwardRef(BingStyles);
