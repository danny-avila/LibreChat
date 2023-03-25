import React, { useState, useEffect, forwardRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs.tsx';
import { useDispatch, useSelector } from 'react-redux';
import { setConversation } from '~/store/convoSlice';

function BingStyles(props, ref) {
  const dispatch = useDispatch();
  const [value, setValue] = useState('fast');
  const { model } = useSelector((state) => state.submit);
  const { conversationId } = useSelector((state) => state.convo);
  const { messages } = useSelector((state) => state.messages);
  
  const isBing = model === 'bingai' || model === 'sydney';
  useEffect(() => {
    if (isBing && !conversationId) {
      dispatch(setConversation({ toneStyle: value }));
    }
  }, [isBing, conversationId, model, value, dispatch]);

  const show = isBing && (!conversationId || messages?.length === 0);
  const defaultClasses = 'p-2 rounded-md font-normal bg-white/[.60] dark:bg-gray-700 text-black';
  const defaultSelected = defaultClasses + 'font-medium data-[state=active]:text-white';

  const selectedClass = (val) => val + '-tab ' + defaultSelected;

  const changeHandler = value => {
    setValue(value);
    dispatch(setConversation({ toneStyle: value }));
  };
  return (
    <Tabs
      defaultValue={value}
      className={`shadow-md mb-1 bing-styles ${show ? 'show' : ''}`}
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
