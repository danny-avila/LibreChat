import React, { useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { NewChatIcon, MobileSidebar, Sidebar } from '~/components/svg';
import { TooltipAnchor, Button } from '~/components/ui';
import { useLocalize, useNewConvo } from '~/hooks';
import { createChatSearchParams } from '~/utils';
import store from '~/store';

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
  const defaultPreset = useRecoilValue(store.defaultPreset);

  const clickHandler = useCallback(() => {
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
      [],
    );
    const params = createChatSearchParams(defaultPreset ?? conversation);
    const newRoute = params.size > 0 ? `/c/new?${params.toString()}` : '/c/new';

    newConvo();
    navigate(newRoute);
    if (isSmallScreen) {
      toggleNav();
    }
  }, [queryClient, conversation, newConvo, navigate, toggleNav, defaultPreset, isSmallScreen]);

  return (
    <>
      <div className="h-header-height xs:pe-3 flex items-center justify-between py-2">
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              size="icon"
              variant="outline"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              className="rounded-xl border-none bg-transparent p-2 hover:bg-surface-hover"
              onClick={toggleNav}
            >
              <Sidebar className="max-md:hidden" />
              <MobileSidebar className="md:hidden" />
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
                className="rounded-xl border-none bg-transparent p-2 hover:bg-surface-hover"
                onClick={clickHandler}
              >
                <NewChatIcon />
              </Button>
            }
          />
        </div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
