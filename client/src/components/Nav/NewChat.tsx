import React, { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage, TStartupConfig } from 'librechat-data-provider';
import { NewChatIcon, MobileSidebar, Sidebar } from '~/components/svg';
import { getDefaultModelSpec, getModelSpecPreset } from '~/utils';
import { TooltipAnchor, Button } from '~/components/ui';
import { useLocalize, useNewConvo } from '~/hooks';
import store from '~/store';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { modeState, Mode } from '~/store/mode';
import { Home } from 'lucide-react';

export default function NewChat({
  index = 0,
  toggleNav,
  subHeaders,
  isSmallScreen,
  headerButtons,
}: {
  index?: number;
  toggleNav: () => void;
  isSmallScreen?: boolean;
  subHeaders?: React.ReactNode;
  headerButtons?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(index);
  const navigate = useNavigate();
  const localize = useLocalize();
  const { conversation } = store.useCreateConversationAtom(index);

  const setMode = useSetRecoilState(modeState);
  const clearAllSubmissions = store.useClearSubmissionState();

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
        return;
      }
      // Abort any in-flight SSE submissions before tearing down the view.
      // Otherwise the stream keeps writing into the messages cache after we
      // clear it, leaving the old chat layered on top of the new-chat UI.
      clearAllSubmissions();
      setMode(null);
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
        [],
      );
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConvo();
      navigate('/c/new', { state: { focusChat: true } });
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [queryClient, conversation, newConvo, navigate, toggleNav, isSmallScreen, clearAllSubmissions, setMode],
  );

  return (
    <>
      <div className="flex items-center justify-between py-[2px] md:py-2">
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              size="icon"
              variant="outline"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
              onClick={toggleNav}
            >
              <Sidebar className="max-md:hidden" />
              <MobileSidebar className="m-1 inline-flex size-10 items-center justify-center md:hidden" />
            </Button>
          }
        />
        <div className="flex">
          {headerButtons}
          <TooltipAnchor
            description={localize('com_ui_new_chat')}
            render={
              <Button
                size="icon"
                variant="outline"
                data-testid="nav-new-chat-button"
                aria-label={localize('com_ui_new_chat')}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={clickHandler}
              >
                <Home className="icon-md md:h-6 md:w-6" />
              </Button>
            }
          />
        </div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
