import { memo, lazy, Suspense, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, NewChatIcon, Button, Avatar, Skeleton } from '@librechat/client';
import type { NavLink } from '~/common';
import { useLocalize, useNewConvo, useAuthContext } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function CollapsedBar({
  links,
  onExpandToSection,
}: {
  links: NavLink[];
  onExpandToSection: (sectionId: string) => void;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation: newConvo } = useNewConvo();
  const { conversation } = store.useCreateConversationAtom(0);

  return (
    <aside
      className="flex h-full w-[50px] flex-shrink-0 flex-col items-center border-r border-border-light bg-surface-primary-alt py-2"
      aria-label={localize('com_nav_control_panel')}
    >
      <div className="flex flex-col items-center gap-1">
        <TooltipAnchor
          side="right"
          description={localize('com_ui_new_chat')}
          render={
            <Button
              asChild
              size="icon"
              variant="ghost"
              aria-label={localize('com_ui_new_chat')}
              className="h-10 w-10 rounded-xl"
            >
              <Link
                to="/c/new"
                state={{ focusChat: true }}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                    return;
                  }
                  e.preventDefault();
                  clearMessagesCache(queryClient, conversation?.conversationId);
                  queryClient.invalidateQueries([QueryKeys.messages]);
                  newConvo();
                }}
              >
                <NewChatIcon className="h-5 w-5 text-text-primary" />
              </Link>
            </Button>
          }
        />
      </div>

      <div className="mt-2 flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {links.map((link, index) => (
          <TooltipAnchor
            key={`collapsed-${index}`}
            side="right"
            description={localize(link.title)}
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={localize(link.title)}
                className="h-10 w-10 rounded-xl"
                onClick={(e) => {
                  if (link.onClick) {
                    link.onClick(e);
                    return;
                  }
                  onExpandToSection(link.id);
                }}
              >
                <link.icon className="h-4 w-4 text-text-secondary" />
              </Button>
            }
          />
        ))}
      </div>

      <div className="mt-auto flex w-full flex-col items-center px-1 pt-2">
        <Suspense fallback={<Skeleton className="h-8 w-8 rounded-full" />}>
          <CollapsedAccountSettings />
        </Suspense>
      </div>
    </aside>
  );
}

const CollapsedAccountSettings = memo(() => (
  <div className="flex w-full justify-center [&_.mt-text-sm]:mt-0 [&_.mt-text-sm]:w-auto [&_.mt-text-sm]:gap-0 [&_.mt-text-sm]:p-1.5 [&_.mt-text-sm_div:not(:first-child)]:hidden">
    <AccountSettings />
  </div>
));

CollapsedAccountSettings.displayName = 'CollapsedAccountSettings';

export default memo(CollapsedBar);
