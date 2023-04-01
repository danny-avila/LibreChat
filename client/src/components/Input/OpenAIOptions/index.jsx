import React, { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import ModelSelect from './ModelSelect';
import { Button } from '../../ui/Button.tsx';
import Settings from './Settings.jsx';
import { cn } from '~/utils/';

import store from '~/store';

function OpenAIOptions() {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [conversation, setConversation] = useRecoilState(store.conversation) || {};
  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const { endpoint, conversationId } = conversation;

  useEffect(() => {
    const { endpoint, chatGptLabel, promptPrefix, temperature, top_p, presence_penalty } = conversation;

    if (endpoint !== 'openAI') return;

    const mustInAdvancedMode =
      chatGptLabel !== null ||
      promptPrefix !== null ||
      temperature !== 0.8 ||
      top_p !== 1 ||
      presence_penalty !== 1;

    if (mustInAdvancedMode && !advancedMode) setAdvancedMode(true);
  }, [conversation, advancedMode]);

  if (endpoint !== 'openAI') return null;
  if (conversationId !== 'new') return null;

  const { model } = conversation;
  const availableModels = endpointsConfig?.['openAI']?.['availableModels'] || [];

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);

  const switchToSimpleMode = () => {
    setConversation(prevState => ({
      ...prevState,
      chatGptLabel: null,
      promptPrefix: null,
      temperature: 0.8,
      top_p: 1,
      presence_penalty: 1
    }));
    setAdvancedMode(false);
  };

  const setModel = newModel => {
    setConversation(prevState => ({
      ...prevState,
      model: newModel
    }));
  };

  const cardStyle =
    'shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div
        className={
          'openAIOptions-simple-container flex w-full items-center justify-center gap-2' +
          (!advancedMode ? ' show' : '')
        }
      >
        <ModelSelect
          model={model}
          availableModels={availableModels}
          onChange={setModel}
          type="button"
          className={cn(
            cardStyle,
            ' z-50 flex h-[40px] items-center justify-center px-4 hover:bg-slate-50 data-[state=open]:bg-slate-50 dark:hover:bg-gray-600 dark:data-[state=open]:bg-gray-600'
          )}
        />
        <Button
          type="button"
          className={cn(
            cardStyle,
            ' min-w-4 z-50 flex h-[40px] items-center justify-center px-4 hover:bg-slate-50 dark:hover:bg-gray-600'
          )}
          onClick={triggerAdvancedMode}
        >
          <Settings2 className="w-4 text-gray-600 dark:text-white" />
        </Button>
      </div>
      <div
        className={
          ' openAIOptions-advanced-container absolute bottom-[-10px] flex w-full flex-col items-center justify-center px-4' +
          (advancedMode ? ' show' : '')
        }
      >
        <div
          className={
            cardStyle +
            ' flex w-full flex-col overflow-hidden rounded-md border bg-slate-200 px-0 pb-[10px] dark:border-white/10 lg:w-[736px]'
          }
        >
          <div className="flex w-full items-center justify-between bg-slate-100 px-4 py-2 dark:bg-gray-800/60">
            <span className="text-xs font-medium font-normal">Advanced settings for OpenAI endpoint</span>
            <Button
              type="button"
              className="h-auto bg-transparent px-2 py-1 text-xs font-medium font-normal text-black hover:bg-slate-200 hover:text-black dark:bg-transparent dark:text-white dark:hover:bg-gray-700 dark:hover:text-white"
              onClick={switchToSimpleMode}
            >
              Switch to simple mode
            </Button>
          </div>
          <div className="px-4 py-4">
            <Settings isOpen={advancedMode} />
          </div>
        </div>
      </div>
    </>
  );
}

export default OpenAIOptions;
