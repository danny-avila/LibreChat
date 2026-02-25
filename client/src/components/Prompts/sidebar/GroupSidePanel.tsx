import { useMemo, useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Sidebar, TooltipAnchor } from '@librechat/client';
import { usePromptGroupsContext, useDashboardContext } from '~/Providers';
import ManagePrompts from '../buttons/ManagePrompts';
import List from '../lists/List';
import PanelNavigation from './PanelNavigation';
import { useLocalize, useCustomLink } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export default function GroupSidePanel({
  children,
  className = '',
  closePanelRef,
  onClose,
}: {
  children?: React.ReactNode;
  className?: string;
  closePanelRef?: React.RefObject<HTMLButtonElement>;
  onClose?: () => void;
}) {
  const location = useLocation();
  const localize = useLocalize();
  const isChatRoute = useMemo(() => location.pathname?.startsWith('/c/'), [location.pathname]);

  const { prevLocationPath } = useDashboardContext();
  const setPromptsName = useSetRecoilState(store.promptsName);
  const setPromptsCategory = useSetRecoilState(store.promptsCategory);
  const clickCallback = useCallback(() => {
    setPromptsName('');
    setPromptsCategory('');
  }, [setPromptsName, setPromptsCategory]);
  const lastConversationId = useMemo(() => {
    if (!prevLocationPath || prevLocationPath.includes('/d/')) {
      return 'new';
    }
    const parts = prevLocationPath.split('/');
    return parts[parts.length - 1];
  }, [prevLocationPath]);
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId, clickCallback);
  const promptsLinkHandler = useCustomLink('/d/prompts');

  const { promptGroups, groupsQuery, nextPage, prevPage, hasNextPage, hasPreviousPage } =
    usePromptGroupsContext();

  return (
    <div
      id="prompts-panel"
      className={cn('flex h-full w-full flex-col md:mr-2 md:w-[450px] md:shrink-0', className)}
    >
      {onClose && (
        <div className="flex items-center justify-between px-2 py-[2px] md:py-2">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <a
              href="/"
              onClick={chatLinkHandler}
              className="flex items-center gap-1 text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="icon-xs" aria-hidden="true" />
              <span>{localize('com_ui_chat')}</span>
            </a>
            <span className="text-text-tertiary" aria-hidden="true">
              /
            </span>
            <a
              href="/d/prompts"
              onClick={promptsLinkHandler}
              className="text-text-secondary hover:text-text-primary"
            >
              {localize('com_ui_prompts')}
            </a>
          </nav>
          <TooltipAnchor
            description={localize('com_nav_close_sidebar')}
            render={
              <Button
                ref={closePanelRef}
                size="icon"
                variant="outline"
                data-testid="close-prompts-panel-button"
                aria-label={localize('com_nav_close_sidebar')}
                aria-expanded={true}
                className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
                onClick={onClose}
              >
                <Sidebar />
              </Button>
            }
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        {children}
        <div className={cn('relative flex h-full flex-col', isChatRoute ? '' : 'px-2 md:px-0')}>
          <List
            groups={promptGroups}
            isChatRoute={isChatRoute}
            isLoading={!!groupsQuery.isLoading}
          />
        </div>
      </div>
      <div className={cn(isChatRoute ? '' : 'px-2 pb-3 pt-2 md:px-0')}>
        <PanelNavigation
          onPrevious={prevPage}
          onNext={nextPage}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          isLoading={groupsQuery.isFetching}
          isChatRoute={isChatRoute}
        >
          {isChatRoute && <ManagePrompts className="select-none" />}
        </PanelNavigation>
      </div>
    </div>
  );
}
