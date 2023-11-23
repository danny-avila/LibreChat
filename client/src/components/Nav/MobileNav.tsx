import React from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize, useConversation } from '~/hooks';
import store from '~/store';

export default function MobileNav({ setNavVisible }) {
  const conversation = useRecoilValue(store.conversation);
  const { newConversation } = useConversation();
  const { title = 'New Chat' } = conversation || {};
  const localize = useLocalize();

  return (
    <div className="fixed left-0 right-0 top-0 z-10 flex items-center justify-between bg-white/95 px-2 border-b border-token-border-medium font-semibold dark:bg-gray-800/90 dark:text-white sm:pl-3 md:hidden">
      <button
        type="button"
        className="-ml-0.5 -mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-md hover:text-gray-900 focus:outline-none focus:ring-0 focus:ring-inset focus:ring-white dark:hover:text-white"
        onClick={() => setNavVisible((prev) => !prev)}
      >
        <span className="sr-only">{localize('com_nav_open_sidebar')}</span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M3 8C3 7.44772 3.44772 7 4 7H20C20.5523 7 21 7.44772 21 8C21 8.55228 20.5523 9 20 9H4C3.44772 9 3 8.55228 3 8ZM3 16C3 15.4477 3.44772 15 4 15H14C14.5523 15 15 15.4477 15 16C15 16.5523 14.5523 17 14 17H4C3.44772 17 3 16.5523 3 16Z" fill="currentColor">
        </path></svg>
      </button>
      <h1 className="flex-1 text-center text-base font-normal">
        {title || localize('com_ui_new_chat')}
      </h1>
      <button type="button" className="px-3" onClick={() => newConversation()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M13.2929 4.29291C15.0641 2.52167 17.9359 2.52167 19.7071 4.2929C21.4783 6.06414 21.4783 8.93588 19.7071 10.7071L18.7073 11.7069L11.1603 19.2539C10.7182 19.696 10.1489 19.989 9.53219 20.0918L4.1644 20.9864C3.84584 21.0395 3.52125 20.9355 3.29289 20.7071C3.06453 20.4788 2.96051 20.1542 3.0136 19.8356L3.90824 14.4678C4.01103 13.8511 4.30396 13.2818 4.7461 12.8397L13.2929 4.29291ZM13 7.41422L6.16031 14.2539C6.01293 14.4013 5.91529 14.591 5.88102 14.7966L5.21655 18.7835L9.20339 18.119C9.40898 18.0847 9.59872 17.9871 9.7461 17.8397L16.5858 11L13 7.41422ZM18 9.5858L14.4142 6.00001L14.7071 5.70712C15.6973 4.71693 17.3027 4.71693 18.2929 5.70712C19.2831 6.69731 19.2831 8.30272 18.2929 9.29291L18 9.5858Z" fill="currentColor">
        </path></svg>
      </button>
    </div>
  );
}
