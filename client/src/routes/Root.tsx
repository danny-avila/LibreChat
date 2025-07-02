import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import throttle from 'lodash/throttle';
import type { ContextType } from '~/common';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import {
  useAuthContext,
  useAssistantsMap,
  useAgentsMap,
  useFileMap,
  useSearchEnabled,
  useMediaQuery,
} from '~/hooks';
import {
  AgentsMapContext,
  AssistantsMapContext,
  FileMapContext,
  SetConvoProvider,
} from '~/Providers';
import TermsAndConditionsModal from '~/components/ui/TermsAndConditionsModal';
import { useUserTermsQuery, useGetStartupConfig } from '~/data-provider';
import { Nav, MobileNav } from '~/components/Nav';
import { useHealthCheck } from '~/data-provider';
import { Banner } from '~/components/Banners';
import { ResizablePanelGroup, ResizablePanel, ResizableHandleAlt } from '~/components/ui/Resizable';
import { normalizeLayout } from '~/utils';

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  // Resizable nav state
  const navPanelRef = useRef<ImperativePanelHandle>(null);
  const [navWidth, setNavWidth] = useState(20); // Default 20% of screen width
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  // Layout configuration
  const defaultLayout = useMemo(() => [navWidth, 100 - navWidth], [navWidth]);
  const minNavSize = 15; // Minimum 15% of screen width (wider range as requested)
  const maxNavSize = 45; // Maximum 45% of screen width
  const collapsedNavSize = 0;
  const autoCollapseThreshold = 4; // Auto-collapse when below ~60px (4% of 1500px screen)

  const { isAuthenticated, logout } = useAuthContext();

  // Global health check - runs once per authenticated session
  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const { data: termsData } = useUserTermsQuery({
    enabled: isAuthenticated && config?.interface?.termsOfService?.modalAcceptance === true,
  });

  useSearchEnabled(isAuthenticated);

  // Sync navVisible with collapse state
  const handleNavToggle = useCallback(() => {
    const newNavVisible = !navVisible;
    setNavVisible(newNavVisible);
    localStorage.setItem('navVisible', JSON.stringify(newNavVisible));

    if (newNavVisible) {
      navPanelRef.current?.expand();
    } else {
      navPanelRef.current?.collapse();
    }
  }, [navVisible]);

  // Throttled layout saving with auto-collapse logic
  const throttledSaveLayout = useMemo(
    () =>
      throttle((sizes: number[]) => {
        const normalizedSizes = normalizeLayout(sizes);
        const newNavWidth = normalizedSizes[0];
        
        // Auto-collapse if width gets too small - trigger the same effect as clicking toggle
        if (newNavWidth < autoCollapseThreshold && navVisible) {
          handleNavToggle();
          return;
        }
        
        localStorage.setItem('nav-layout', JSON.stringify(normalizedSizes));
        setNavWidth(newNavWidth);
      }, 350),
    [navVisible, autoCollapseThreshold, handleNavToggle],
  );

  // Load saved layout on mount
  useEffect(() => {
    const savedLayout = localStorage.getItem('nav-layout');
    if (savedLayout) {
      try {
        const layout = JSON.parse(savedLayout);
        if (Array.isArray(layout) && layout.length >= 2) {
          setNavWidth(Math.max(minNavSize, Math.min(maxNavSize, layout[0])));
        }
      } catch {
        // Use default if parsing fails
      }
    }
  }, [minNavSize, maxNavSize]);

  // Handle responsive behavior
  useEffect(() => {
    if (isSmallScreen) {
      navPanelRef.current?.collapse();
    } else {
      if (navVisible) {
        navPanelRef.current?.expand();
      }
    }
  }, [isSmallScreen, navVisible]);

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
            <Banner onHeightChange={setBannerHeight} />
            <div className="flex" style={{ height: `calc(100dvh - ${bannerHeight}px)` }}>
              <div className="relative z-0 flex h-full w-full overflow-hidden">
                {isSmallScreen ? (
                  // Mobile layout - use original Nav behavior
                  <>
                    <Nav navVisible={navVisible} setNavVisible={handleNavToggle} />
                    <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                      <MobileNav setNavVisible={handleNavToggle} />
                      <Outlet
                        context={
                          { navVisible, setNavVisible: handleNavToggle } satisfies ContextType
                        }
                      />
                    </div>
                  </>
                ) : (
                  // Desktop layout - use resizable panels
                  <ResizablePanelGroup
                    direction="horizontal"
                    onLayout={(sizes) => throttledSaveLayout(sizes)}
                    className="h-full w-full"
                  >
                    <ResizablePanel
                      ref={navPanelRef}
                      defaultSize={navVisible ? defaultLayout[0] : collapsedNavSize}
                      minSize={autoCollapseThreshold}
                      maxSize={maxNavSize}
                      collapsedSize={collapsedNavSize}
                      collapsible={true}
                      order={1}
                      id="nav-panel"
                      className="transition-all duration-200 ease-in-out"
                    >
                      <Nav navVisible={navVisible} setNavVisible={handleNavToggle} />
                    </ResizablePanel>
                    <ResizableHandleAlt
                      withHandle
                      className="bg-border-medium text-text-primary transition-colors duration-200 hover:bg-border-heavy"
                    />
                    <ResizablePanel
                      defaultSize={defaultLayout[1]}
                      minSize={55}
                      order={2}
                      id="main-content-panel"
                      className="relative"
                    >
                      <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                        <MobileNav setNavVisible={handleNavToggle} />
                        <Outlet
                          context={
                            { navVisible, setNavVisible: handleNavToggle } satisfies ContextType
                          }
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </div>
            </div>
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
