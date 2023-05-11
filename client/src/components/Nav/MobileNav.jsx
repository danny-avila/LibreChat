import React from 'react';
import { useRecoilValue } from 'recoil';

import store from '~/store';

export default function MobileNav({ setNavVisible }) {
  const conversation = useRecoilValue(store.conversation);
  const { newConversation } = store.useConversation();
  const { title = 'New Chat' } = conversation || {};

  return (
    <div className="fixed left-0 right-0 top-0 z-10 flex items-center border-b border-white/20 bg-gray-800 pl-1 pt-1 text-gray-200 sm:pl-3 md:hidden">
      <button
        type="button"
        className="-ml-0.5 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white dark:hover:text-white"
        onClick={() => setNavVisible(prev => !prev)}
      >
        <span className="sr-only">Open sidebar</span>
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1="3"
            y1="12"
            x2="21"
            y2="12"
          />
          <line
            x1="3"
            y1="6"
            x2="21"
            y2="6"
          />
          <line
            x1="3"
            y1="18"
            x2="21"
            y2="18"
          />
        </svg>
      </button>
      <h1 className="flex-1 text-center text-base font-normal">{title || 'New Chat'}</h1>
      <button
        type="button"
        className="px-3"
        onClick={() => newConversation()}
      >
        <svg
          stroke="currentColor"
          fill="none"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          height="1em"
          width="1em"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1="12"
            y1="5"
            x2="12"
            y2="19"
          />
          <line
            x1="5"
            y1="12"
            x2="19"
            y2="12"
          />
        </svg>
      </button>
    </div>
  );
}
