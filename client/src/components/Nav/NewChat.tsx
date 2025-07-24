import React, { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { NewChatIcon, MobileSidebar, Sidebar } from '~/components/svg';
import { TooltipAnchor, Button } from '~/components/ui';
import { useLocalize, useNewConvo, useHasAccess } from '~/hooks';
import { AuthContext } from '~/hooks/AuthContext';
import { LayoutGrid } from 'lucide-react';
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
  const authContext = useContext(AuthContext);
  const hasAccessToAgents = useHasAccess({
    permissionType: PermissionTypes.AGENTS,
    permission: Permissions.USE,
  });
  const hasAccessToMarketplace = useHasAccess({
    permissionType: PermissionTypes.MARKETPLACE,
    permission: Permissions.USE,
  });

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
        return;
      }
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
    [queryClient, conversation, newConvo, navigate, toggleNav, isSmallScreen],
  );

  const handleAgentMarketplace = useCallback(() => {
    navigate('/agents');
    if (isSmallScreen) {
      toggleNav();
    }
  }, [navigate, isSmallScreen, toggleNav]);

  // Check if auth is ready (avoid race conditions)
  const authReady =
    authContext?.isAuthenticated !== undefined &&
    (authContext?.isAuthenticated === false || authContext?.user !== undefined);

  // Show agent marketplace when marketplace permission is enabled, auth is ready, and user has access to agents
  const showAgentMarketplace = authReady && hasAccessToAgents && hasAccessToMarketplace;

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
                <NewChatIcon className="icon-md md:h-6 md:w-6" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Agent Marketplace button - separate row like ChatGPT */}
      {showAgentMarketplace && (
        <div className="flex">
          <TooltipAnchor
            description={localize('com_agents_marketplace')}
            render={
              <Button
                variant="outline"
                data-testid="nav-agents-marketplace-button"
                aria-label={localize('com_agents_marketplace')}
                className="flex w-full items-center justify-start gap-3 rounded-xl border-none bg-transparent p-3 text-left hover:bg-surface-hover"
                onClick={handleAgentMarketplace}
              >
                <LayoutGrid className="h-5 w-5 flex-shrink-0" />
                <span className="truncate text-sm font-medium">
                  {localize('com_agents_marketplace')}
                </span>
              </Button>
            }
          />
        </div>
      )}
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
