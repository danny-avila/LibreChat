import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';
import EndpointOptionsDialog from '../Endpoints/EndpointOptionsDialog';
import { cn } from '~/utils/';

import store from '~/store';

const MessageHeader = ({ isSearchView = false }) => {
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const conversation = useRecoilValue(store.conversation);
  const searchQuery = useRecoilValue(store.searchQuery);
  const { endpoint } = conversation;

  const getConversationTitle = () => {
    if (isSearchView) return `Search: ${searchQuery}`;
    else {
      let _title = `${endpoint}`;

      if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
        const { chatGptLabel, model } = conversation;
        if (model) _title += `: ${model}`;
        if (chatGptLabel) _title += ` as ${chatGptLabel}`;
      } else if (endpoint === 'google') {
        _title = 'PaLM';
        const { modelLabel, model } = conversation;
        if (model) _title += `: ${model}`;
        if (modelLabel) _title += ` as ${modelLabel}`;
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
    <>
      <div
        className={cn(
          'dark:text-gray-450 w-full gap-1 border-b border-black/10 bg-gray-50 text-sm text-gray-500 transition-all hover:bg-gray-100 hover:bg-opacity-30 dark:border-gray-900/50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:hover:bg-opacity-100 dark:text-gray-500',
          endpoint === 'chatGPTBrowser' ? '' : 'cursor-pointer '
        )}
        onClick={() => (endpoint === 'chatGPTBrowser' ? null : setSaveAsDialogShow(true))}
      >
        <div className="d-block flex w-full items-center justify-center p-3">
          {getConversationTitle()}
        </div>
      </div>

      <EndpointOptionsDialog
        open={saveAsDialogShow}
        onOpenChange={setSaveAsDialogShow}
        preset={conversation}
      />
    </>
  );
};

export default MessageHeader;
