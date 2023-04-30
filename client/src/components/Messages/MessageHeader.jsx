import React, { useState } from 'react';
import { useRecoilValue } from 'recoil';
import EndpointOptionsDialog from '../Endpoints/EndpointOptionsDialog';
import { cn } from '~/utils/';
import { Button } from '../ui/Button.tsx';

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
  const [saveAsDialogShow, setSaveAsDialogShow] = useState(false);
  const conversation = useRecoilValue(store.conversation);
  const searchQuery = useRecoilValue(store.searchQuery);
  const { endpoint } = conversation;
  const isNotClickable = endpoint === 'chatGPTBrowser' || endpoint === 'gptPlugins';
  const { model } = conversation;
  const plugins = (
    <>
      Plugins{' '}
      <span class="py-0.25 ml-1 rounded bg-blue-200 px-1 text-[10px] font-semibold uppercase text-[#4559A4]">
        alpha
      </span>
      <span class="px-1">•</span>
      Model: {model}
      <span class="px-1">•</span>
      <div>Enabled plugins:</div>
    </>
  );

  const getConversationTitle = () => {
    if (isSearchView) return `Search: ${searchQuery}`;
    else {
      let _title = `${endpoint}`;

      if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
        const { chatGptLabel } = conversation;
        if (model) _title += `: ${model}`;
        if (chatGptLabel) _title += ` as ${chatGptLabel}`;
      } else if (endpoint === 'bingAI') {
        const { jailbreak, toneStyle } = conversation;
        if (toneStyle) _title += `: ${toneStyle}`;
        if (jailbreak) _title += ` as Sydney`;
      } else if (endpoint === 'chatGPTBrowser') {
        if (model) _title += `: ${model}`;
      } else if (endpoint === 'gptPlugins') {
        return plugins;
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
          'dark:text-gray-450 w-full gap-1 border-b border-black/10 bg-gray-50 text-sm text-gray-500 transition-all hover:bg-gray-100 hover:bg-opacity-30 dark:border-gray-900/50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:hover:bg-opacity-100',
          isNotClickable ? '' : 'cursor-pointer '
        )}
        onClick={() => (isNotClickable ? null : setSaveAsDialogShow(true))}
      >
        <div className="d-block flex w-full items-center justify-center p-3">{getConversationTitle()}</div>
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
