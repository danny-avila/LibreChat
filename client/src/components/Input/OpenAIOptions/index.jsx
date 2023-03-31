import React, { useState, useEffect, forwardRef } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../ui/Tabs.tsx';
import { useRecoilValue, useRecoilState } from 'recoil';
import { Button } from '../../ui/Button.tsx';

import store from '~/store';

function OpenAIOptions({ conversation = {} }) {
  const { endpoint } = conversation;
  const { advancedMode, setAdvancedMode } = useState(false);

  const triggerAdvancedMode = () => setAdvancedMode(prev => !prev);

  if (endpoint !== 'openAI') return null;

  const { model } = conversation;

  const cardStyle =
    'shadow-md px-4 h-[40px] rounded-md min-w-[75px] font-normal bg-white border-black/10 border dark:bg-gray-700 text-black dark:text-white';

  return (
    <>
      <div className="flex w-full items-center justify-center gap-2">
        <Button
          type="button"
          className={cardStyle + ' flex items-center justify-center hover:bg-slate-50 dark:hover:bg-gray-600'}
        >
          <span className="w-full text-center text-xs font-medium font-normal">Model: {model}</span>
        </Button>
        <Button
          type="button"
          className={cardStyle + ' flex items-center justify-center hover:bg-slate-50 dark:hover:bg-gray-600'}
          onClick={triggerAdvancedMode}
        >
          <span className="w-full text-center text-xs font-medium font-normal">More</span>
        </Button>
      </div>
      <div
        className={
          cardStyle +
          ' p-b-[40px] absolute left-4 right-4 bottom-[40px] flex h-[220px] flex-col rounded-md bg-white'
        }
      >
        <div>title</div>
        <div>content</div>
      </div>
    </>
  );
}

export default OpenAIOptions;
