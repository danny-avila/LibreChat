import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import {
  UnifiedSidebar,
  SIDEBAR_TRANSITION,
  MOBILE_PANE_SHIFT,
  DRAWER_Z_INDEX,
  TRANSITION_MS,
  EASING,
} from '~/components/UnifiedSidebar';
import {
  PromptGroupsProvider,
  AssistantsMapContext,
  AgentsMapContext,
  SetConvoProvider,
  FileMapContext,
} from '~/Providers';
import {
  useSearchEnabled,
  useAssistantsMap,
  useAuthContext,
  useAgentsMap,
  useLocalize,
  useFileMap,
} from '~/hooks';
import KeyboardShortcutsDialog from '~/components/Nav/KeyboardShortcutsDialog';
import KeyboardDeleteDialog from '~/components/Nav/KeyboardDeleteDialog';
import { useUserTermsQuery, useGetStartupConfig } from '~/data-provider';
import useKeyboardShortcuts from '~/hooks/useKeyboardShortcuts';
import useDrawerDismiss from '~/hooks/Nav/useDrawerDismiss';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import useSidebarState from '~/hooks/Nav/useSidebarState';
import { TermsAndConditionsModal } from '~/components/ui';
import useDrawerSwipe from '~/hooks/Nav/useDrawerSwipe';
import { useHealthCheck } from '~/data-provider';
import { Banner } from '~/components/Banners';
import { cn } from '~/utils';

/** Isolates keyboard shortcut listeners so they only mount after auth. */
function KeyboardShortcutsProvider() {
  useKeyboardShortcuts();
  return (
    <>
      <KeyboardShortcutsDialog />
      <KeyboardDeleteDialog />
    </>
  );
}

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  /** Shared with the drawer so the two agree on the breakpoint-transition frame. */
  const {
    isSmallScreen,
    expanded: sidebarExpanded,
    setExpanded: setSidebarExpanded,
  } = useSidebarState();
  const localize = useLocalize();
  /** The one path drawer mutations take: it kicks the slide imperatively and
   *  defers the Recoil flip, so a large conversation cannot stall first motion. */
  const { setSidebarOpen } = useSidebarToggle();
  /** The drawer and pane snap under reduced motion (see kickDrawerAnimation),
   *  so the scrim must not keep fading on its own. */
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const paneRef = useRef<HTMLDivElement>(null);
  /** Keyed off the committed state rather than the scrim's own click, because
   *  the header button, Escape, conversation selection and the bottom bar all
   *  close the drawer too. */
  const { isClosing, onScrimClick } = useDrawerDismiss({
    expanded: sidebarExpanded,
    isSmallScreen,
    prefersReducedMotion,
    paneRef,
    setOpen: setSidebarOpen,
  });
  /** Focus handoff lives in the drawer header's own expanded-effect — the
   * commit drives it, so every opener (button, swipe) is covered without a
   * timer racing the deferred state flip. */
  const handleDrawerOpenChange = useCallback(
    (next: boolean) => {
      startTransition(() => {
        setSidebarExpanded(next);
      });
    },
    [setSidebarExpanded],
  );
  const { isAuthenticated, logout } = useAuthContext();

  useDrawerSwipe({
    paneRef,
    /** Auth gates the whole tree below (`return null`), so the swipe surfaces
     * only exist once authenticated — enabling earlier would attach to
     * nothing and never re-run when they mount. */
    enabled: isSmallScreen && isAuthenticated,
    open: sidebarExpanded,
    onOpenChange: handleDrawerOpenChange,
  });

  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const { data: termsData } = useUserTermsQuery({
    enabled: isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true,
  });

  useSearchEnabled(isAuthenticated);

  useEffect(() => {
    if (termsData) {
      setShowTerms(!termsData.termsAccepted);
    }
  }, [termsData]);

  const handleAcceptTerms = () => {
    setShowTerms(false);
  };

  const handleDeclineTerms = () => {
    setShowTerms(false);
    logout('/login?redirect=false');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SetConvoProvider>
      <FileMapContext.Provider value={fileMap}>
        <AssistantsMapContext.Provider value={assistantsMap}>
          <AgentsMapContext.Provider value={agentsMap}>
            <PromptGroupsProvider>
              <Banner onHeightChange={setBannerHeight} />
              <div className="flex" style={{ height: `calc(100dvh - ${bannerHeight}px)` }}>
                <div className="relative z-0 flex h-full w-full overflow-hidden">
                  <UnifiedSidebar />
                  <div
                    ref={paneRef}
                    /** Focus target of last resort when the drawer closes on a
                     *  route that renders no opener. Not in the tab order. */
                    tabIndex={-1}
                    className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden focus:outline-none"
                    style={{
                      /** Self-referential, so it needs no width literal and survives rotation. */
                      transform: isSmallScreen && sidebarExpanded ? MOBILE_PANE_SHIFT : 'none',
                      transition: SIDEBAR_TRANSITION,
                    }}
                    inert={isSmallScreen && sidebarExpanded ? '' : undefined}
                  >
                    <Outlet />
                  </div>
                  {/* Dismiss target over the strip of chat the drawer leaves
                      visible. It sits outside the pane because the pane is
                      inert while the drawer is open, which would swallow the
                      click. */}
                  {isSmallScreen && (
                    <button
                      type="button"
                      aria-label={localize('com_nav_close_sidebar')}
                      onClick={onScrimClick}
                      tabIndex={sidebarExpanded ? 0 : -1}
                      aria-hidden={!sidebarExpanded || undefined}
                      className={cn(
                        'absolute inset-0 bg-surface-overlay/50',
                        sidebarExpanded ? 'opacity-100' : 'opacity-0',
                        !sidebarExpanded && !isClosing && 'pointer-events-none',
                      )}
                      style={{
                        zIndex: DRAWER_Z_INDEX - 1,
                        transition: prefersReducedMotion
                          ? undefined
                          : `opacity ${TRANSITION_MS}ms ${EASING}`,
                      }}
                    />
                  )}
                </div>
              </div>
            </PromptGroupsProvider>
            <KeyboardShortcutsProvider />
          </AgentsMapContext.Provider>
          {config?.interface?.termsOfService?.modalAcceptance === true && (
            <TermsAndConditionsModal
              open={showTerms}
              onOpenChange={setShowTerms}
              onAccept={handleAcceptTerms}
              onDecline={handleDeclineTerms}
              title={config.interface.termsOfService.modalTitle}
              modalContent={config.interface.termsOfService.modalContent}
            />
          )}
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SetConvoProvider>
  );
}
