import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import FilterPrompts from '~/components/Prompts/Groups/FilterPrompts';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import GroupSidePanel from './Groups/GroupSidePanel';
import { useHasAccess, useLocalize } from '~/hooks';
import { PromptGroupsProvider } from '~/Providers';
import { useMediaQuery } from '@librechat/client';
import { cn } from '~/utils';

export default function PromptsView() {
  const params = useParams();
  const navigate = useNavigate();
  const isDetailView = useMemo(() => !!(params.promptId || params['*'] === 'new'), [params]);
  const isSmallerScreen = useMediaQuery('(max-width: 768px)');
  const [panelVisible, setPanelVisible] = useState(!isSmallerScreen);
  const openPanelRef = useRef<HTMLButtonElement>(null);
  const closePanelRef = useRef<HTMLButtonElement>(null);
  const localize = useLocalize();

  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccess) {
      timeoutId = setTimeout(() => {
        navigate('/c/new');
      }, 1000);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hasAccess, navigate]);

  const togglePanel = useCallback(() => {
    setPanelVisible((prev) => {
      const newValue = !prev;
      requestAnimationFrame(() => {
        if (newValue) {
          closePanelRef?.current?.focus();
        } else {
          openPanelRef?.current?.focus();
        }
      });
      return newValue;
    });
  }, []);

  useEffect(() => {
    if (isSmallerScreen && isDetailView) {
      setPanelVisible(false);
    }
  }, [isSmallerScreen, isDetailView]);

  if (!hasAccess) {
    return null;
  }

  return (
    <PromptGroupsProvider>
      <div className="flex h-screen w-full flex-col bg-surface-primary p-0 lg:p-2">
        <DashBreadcrumb
          showToggle={isSmallerScreen && isDetailView}
          onToggle={togglePanel}
          openPanelRef={openPanelRef}
        />
        <div className="flex w-full flex-grow flex-row overflow-hidden">
          {isSmallerScreen && panelVisible && isDetailView && (
            <div
              className="fixed inset-0 z-40 bg-black/50 transition-opacity"
              onClick={togglePanel}
              role="button"
              tabIndex={0}
              aria-label={localize('com_nav_toggle_sidebar')}
            />
          )}

          {(!isSmallerScreen || !isDetailView || panelVisible) && (
            <div
              className={cn(
                'transition-transform duration-300 ease-in-out',
                isSmallerScreen && isDetailView
                  ? 'fixed left-0 top-0 z-50 h-full w-[320px] bg-surface-primary'
                  : 'flex',
              )}
            >
              <GroupSidePanel
                closePanelRef={closePanelRef}
                onClose={isSmallerScreen && isDetailView ? togglePanel : undefined}
              >
                <div className="mt-1 flex flex-row items-center justify-between px-2 md:px-2">
                  <FilterPrompts />
                </div>
              </GroupSidePanel>
            </div>
          )}

          <div
            className={cn(
              'scrollbar-gutter-stable w-full overflow-y-auto lg:w-3/4 xl:w-3/4',
              isDetailView ? 'block' : 'hidden md:block',
            )}
          >
            <Outlet />
          </div>
        </div>
      </div>
    </PromptGroupsProvider>
  );
}
