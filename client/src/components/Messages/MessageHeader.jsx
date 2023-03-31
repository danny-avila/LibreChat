import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';

import store from '~/store';

const clipPromptPrefix = str => {
  if (typeof str !== 'string') {
    return null;
  } else if (str.length > 10) {
    return str.slice(0, 10) + '...';
  } else {
    return str;
  }
};

const MessageHeader = ({ isSearchView = false }) => {
  const [extended, setExtended] = useState(false);
  const conversation = useRecoilValue(store.conversation);
  const searchQuery = useRecoilValue(store.searchQuery);
  const { endpoint } = conversation;

  let options = [];
  if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
    options.push(['model', conversation?.model]);
    options.push(['chatGptLabel', conversation?.chatGptLabel]);
    options.push(['promptPrefix', clipPromptPrefix(conversation?.promptPrefix)]);
    options.push(['temperature', conversation?.temperature]);
    options.push(['top_p', conversation?.top_p]);
    options.push(['presence_penalty', conversation?.presence_penalty]);
  } else if (endpoint === 'bingAI') {
    options.push(['jailbreak', !!conversation?.jailbreak]);
    options.push(['toneStyle', conversation?.toneStyle]);
  } else if (endpoint === 'chatGPTBrowser') {
    options.push(['model', conversation?.model]);
  }

  const triggerExtend = () => {
    setExtended(prevState => !prevState);
  };

  const getConversationTitle = () => {
    if (isSearchView) return `Search: ${searchQuery}`;
    else {
      let _title = `${endpoint}`;

      if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
        const { chatGptLabel, model } = conversation;
        if (model) _title += `: ${model}`;
        if (chatGptLabel) _title += ` as ${chatGptLabel}`;
      } else if (endpoint === 'bingAI') {
        const { jailbreak, toneStyle } = conversation;
        if (toneStyle) _title += `: ${toneStyle}`;
        if (jailbreak) _title += ` as Sydney`;
      } else if (endpoint === 'chatGPTBrowser') {
        const { model } = conversation;
        if (model) _title += `: ${model}`;
      } else if (endpoint === null) {
        null;
      } else {
        null;
      }
      return _title;
    }
  };

  return (
    <div
      className={
        'dark:text-gray-450 w-full gap-1 border-b border-black/10 bg-gray-50 text-sm text-gray-500 transition-all hover:bg-gray-100 dark:border-gray-900/50 dark:bg-gray-700 dark:hover:bg-gray-600' +
        (extended ? ' max-h-[500px]' : ' max-h-[45px]')
      }
      onClick={triggerExtend}
    >
      <div className="d-block flex w-full items-center justify-center p-3">{getConversationTitle()}</div>

      {extended ? (
        <div className="d-block relative w-full border-t border-black/10 p-3 dark:border-gray-900/50 ">
          <div className="relative m-auto flex flex-wrap items-center justify-start md:max-w-2xl lg:max-w-2xl xl:max-w-3xl">
            {options.map(([key, value]) => (
              <div
                key={key}
                className="w-1/2 xl:w-1/3"
              >
                <strong>{key}:</strong> {value || 'null'}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MessageHeader;
