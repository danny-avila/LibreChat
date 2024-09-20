import React from 'react';
import { useRecoilValue } from 'recoil';
import type { Dispatch, SetStateAction } from 'react';
import { useLocalize, useNewConvo } from '~/hooks';
import store from '~/store';

export default function MobileNav({
  setNavVisible,
}: {
  setNavVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const localize = useLocalize();
  const { newConversation } = useNewConvo(0);
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { title = 'New Chat' } = conversation || {};

  return (
    <div className="bg-token-main-surface-primary sticky top-0 z-10 flex min-h-[40px] items-center justify-center bg-white pl-1 dark:bg-gray-800 dark:text-white md:hidden">
      <button
        type="button"
        data-testid="mobile-header-new-chat-button"
        aria-label={localize('com_nav_open_sidebar')}
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover"
        onClick={() =>
          setNavVisible((prev) => {
            localStorage.setItem('navVisible', JSON.stringify(!prev));
            return !prev;
          })
        }
      >
        <span className="sr-only">{localize('com_nav_open_sidebar')}</span>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <h1 className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center text-sm font-normal">
        {title || localize('com_ui_new_chat')}
      </h1>
      <button
        type="button"
        aria-label={localize('com_ui_new_chat')}
        className="m-1 inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-hover"
        onClick={() => newConversation()}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="icon-md"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M16.7929 2.79289C18.0118 1.57394 19.9882 1.57394 21.2071 2.79289C22.4261 4.01184 22.4261 5.98815 21.2071 7.20711L12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16H9C8.44772 16 8 15.5523 8 15V12C8 11.7348 8.10536 11.4804 8.29289 11.2929L16.7929 2.79289ZM19.7929 4.20711C19.355 3.7692 18.645 3.7692 18.2071 4.2071L10 12.4142V14H11.5858L19.7929 5.79289C20.2308 5.35499 20.2308 4.64501 19.7929 4.20711ZM6 5C5.44772 5 5 5.44771 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V14C19 13.4477 19.4477 13 20 13C20.5523 13 21 13.4477 21 14V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34314 4.34315 3 6 3H10C10.5523 3 11 3.44771 11 4C11 4.55228 10.5523 5 10 5H6Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
}
