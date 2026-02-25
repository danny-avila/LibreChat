import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar, useMediaQuery } from '@librechat/client';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { PermissionTypes, Permissions, SystemRoles } from 'librechat-data-provider';
import { AdvancedSwitch, AdminSettings } from '~/components/Prompts';
import { useHasAccess, useLocalize, useAuthContext } from '~/hooks';
import DashBreadcrumb from '~/routes/Layouts/DashBreadcrumb';
import GroupSidePanel from '../sidebar/GroupSidePanel';
import FilterPrompts from '../sidebar/FilterPrompts';
import { PromptGroupsProvider } from '~/Providers';
import { cn } from '~/utils';

const promptsPathPattern = /prompts\/(?!new(?:\/|$)).*$/;

export default function PromptsView() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { user } = useAuthContext();

  const isDetailView = useMemo(() => !!(params.promptId || params['*'] === 'new'), [params]);
  const isSmallerScreen = useMediaQuery('(max-width: 768px)');
  const [panelVisible, setPanelVisible] = useState(!isSmallerScreen);
  const openPanelRef = useRef<HTMLButtonElement>(null);
  const closePanelRef = useRef<HTMLButtonElement>(null);
  const isPromptsPath = useMemo(
    () => promptsPathPattern.test(location.pathname),
    [location.pathname],
  );

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
        {isSmallerScreen && isDetailView ? (
          <div className="mr-2 mt-2 flex h-10 items-center justify-between">
            <button
              ref={openPanelRef}
              type="button"
              onClick={togglePanel}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-surface-primary text-text-primary transition-all hover:bg-surface-hover"
              aria-label={localize('com_nav_open_sidebar')}
              aria-expanded={false}
              aria-controls="prompts-panel"
            >
              <Sidebar className="h-4 w-4" />
            </button>
            <div className="flex items-center justify-center gap-2">
              {isPromptsPath && <AdvancedSwitch />}
              {user?.role === SystemRoles.ADMIN && <AdminSettings />}
            </div>
          </div>
        ) : (
          <DashBreadcrumb />
        )}
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
                <div className="mt-1 flex flex-row items-center justify-between px-2">
                  <FilterPrompts dropdownClassName="z-[100]" />
                </div>
              </GroupSidePanel>
            </div>
          )}

          <div
            className={cn(
              'scrollbar-gutter-stable min-w-0 flex-1 overflow-y-auto',
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
