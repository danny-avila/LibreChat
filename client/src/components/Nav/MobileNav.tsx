import React from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import { CodeCanBrandIcon } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import type { Dispatch, SetStateAction } from 'react';
import { useLocalize, useNewConvo } from '~/hooks';
import store from '~/store';

export default function MobileNav({
  setNavVisible,
}: {
  setNavVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { title } = conversation || {};
  const headerTitle = title?.trim() ? title : localize('com_ui_new_chat');

  return (
    <div className="dark:border-white/8 sticky top-0 z-10 flex min-h-[56px] items-center justify-between gap-2 border-b border-[rgba(11,47,91,0.06)] bg-white px-3 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] dark:bg-dm-surface2 dark:text-dm-text md:hidden">
      <button
        type="button"
        data-testid="mobile-header-new-chat-button"
        aria-label={localize('com_nav_open_sidebar')}
        className="dark:bg-white/6 inline-flex size-9 items-center justify-center rounded-[10px] bg-[rgba(11,47,91,0.06)] text-ink-800 transition-colors hover:bg-[rgba(11,47,91,0.10)] dark:text-dm-text dark:hover:bg-white/10"
        onClick={() =>
          setNavVisible((prev) => {
            localStorage.setItem('navVisible', JSON.stringify(!prev));
            return !prev;
          })
        }
      >
        <span className="sr-only">{localize('com_nav_open_sidebar')}</span>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M3 7h12M3 12h16M3 17h10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <CodeCanBrandIcon size={22} radius={5} />
        <h1 className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-ink-800 dark:text-dm-text">
          {headerTitle}
        </h1>
      </div>
      <button
        type="button"
        aria-label={localize('com_ui_new_chat')}
        className="inline-flex size-9 items-center justify-center rounded-[10px] bg-ink-800 text-white shadow-[0_2px_6px_-2px_rgba(11,47,91,0.45)] transition-colors hover:bg-ink-700 dark:bg-signal-amber dark:text-dm-ambient dark:shadow-[0_2px_6px_-2px_rgba(242,182,68,0.45)] dark:hover:bg-[#F5C566]"
        onClick={() => {
          queryClient.setQueryData<TMessage[]>(
            [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
            [],
          );
          queryClient.invalidateQueries([QueryKeys.messages]);
          newConversation();
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 19h4l11-11-4-4L5 15v4z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
