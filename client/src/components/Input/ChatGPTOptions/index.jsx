import React, { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import ModelDropDown from '../../ui/ModelDropDown.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function ChatGPTOptions() {
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const { endpoint, conversationId } = conversation;
  const { model } = conversation;

  console.log('ChatGPTOptions', endpoint, model);
  useEffect(() => {
    if (endpoint !== 'chatGPTBrowser') return;
  }, [conversation]);

  if (endpoint !== 'chatGPTBrowser') return null;
  if (conversationId !== 'new') return null;

  const setOption = param => newValue => {
    let update = {};
    update[param] = newValue;
    setConversation(prevState => ({
      ...prevState,
      ...update
    }));
  };

  const cardStyle =
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <div className="openAIOptions-simple-container flex w-full items-center justify-center gap-2 show">
      <ModelDropDown
        model={model}
        setModel={setOption('model')}
        endpoint="chatGPTBrowser"
        showAbove={true}
        showLabel={false}
        className={cn(
          cardStyle,
          'min-w-48 z-50 flex h-[40px] w-48 items-center justify-center px-4 ring-0 hover:cursor-pointer hover:bg-slate-50 focus:ring-0 focus:ring-offset-0 data-[state=open]:bg-slate-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
        )}
      />
    </div>
  );
}

export default ChatGPTOptions;
