import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Home, PanelLeft, Settings } from 'lucide-react';
import { useNewConvo, useLocalize } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

export default function IconRail({
  navVisible,
  setNavVisible,
}: {
  navVisible: boolean;
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation: newConvo } = useNewConvo(0);
  const { conversation } = store.useCreateConversationAtom(0);

  const handleNewChat = useCallback(() => {
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConvo();
    navigate('/c/new', { state: { focusChat: true } });
  }, [queryClient, conversation, newConvo, navigate]);

  const handleHome = useCallback(() => {
    navigate('/c/new');
  }, [navigate]);

  const toggleNav = useCallback(() => {
    setNavVisible((prev: boolean) => {
      localStorage.setItem('navVisible', JSON.stringify(!prev));
      return !prev;
    });
  }, [setNavVisible]);

  const handleSettings = useCallback(() => {
    navigate('/d/settings');
  }, [navigate]);

  const btnClass =
    'flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover transition-colors';

  return (
    <div className="flex w-[52px] flex-shrink-0 flex-col items-center gap-1 border-r border-icon-rail-border bg-icon-rail-bg py-3 max-md:hidden">
      {/* $gz logo */}
      <button
        className="mb-2 flex h-8 w-8 items-center justify-center"
        onClick={handleNewChat}
        aria-label={localize('com_ui_new_chat')}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 512 512"
          xmlns="http://www.w3.org/2000/svg"
          className="rounded-lg"
        >
          <rect
            width="512"
            height="512"
            rx="64"
            fill="currentColor"
            className="text-text-primary"
          />
          <text
            x="250"
            y="355"
            textAnchor="middle"
            fontFamily="'Space Mono', monospace"
            fontWeight="700"
            fontSize="280"
            className="fill-surface-primary"
            letterSpacing="-10"
          >
            {'$gz'}
          </text>
        </svg>
      </button>

      {/* New chat */}
      <button className={btnClass} onClick={handleNewChat} aria-label={localize('com_ui_new_chat')}>
        <Plus size={18} />
      </button>

      {/* Home */}
      <button className={btnClass} onClick={handleHome} aria-label="Home">
        <Home size={18} />
      </button>

      {/* Toggle sidebar */}
      <button
        className={btnClass}
        onClick={toggleNav}
        aria-label={navVisible ? 'Hide sidebar' : 'Show sidebar'}
      >
        <PanelLeft size={18} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <button className={btnClass} onClick={handleSettings} aria-label="Settings">
        <Settings size={18} />
      </button>
    </div>
  );
}
