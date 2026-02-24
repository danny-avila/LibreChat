import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import type { ContextType } from '~/common';
import {
  useSearchEnabled,
  useAssistantsMap,
  useAuthContext,
  useAgentsMap,
  useFileMap,
} from '~/hooks';
import {
  PromptGroupsProvider,
  AssistantsMapContext,
  AgentsMapContext,
  SetConvoProvider,
  FileMapContext,
} from '~/Providers';
import { useUserTermsQuery, useGetStartupConfig } from '~/data-provider';
import { Nav, MobileNav, NAV_WIDTH } from '~/components/Nav';
import { TermsAndConditionsModal } from '~/components/ui';
import { useHealthCheck } from '~/data-provider';
import { Banner } from '~/components/Banners';
import '@newjersey/feedback-widget/feedback-widget.min.js';
import SkipToContentLink from '~/nj/components/SkipToContentLink';

// NJ: Tells TypeScript that <feedback-widget> is a valid custom element.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'feedback-widget': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const { isAuthenticated, logout } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const contentRef = useRef<HTMLDivElement>(null);

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
              {/* NJ: We added dynamic height measurement via CSS instead of setBannerHeight, required extra div */}
              <div className="flex h-dvh flex-col">
                <SkipToContentLink targetRef={contentRef} />
                <Banner onHeightChange={setBannerHeight} />
                <div className="flex min-h-0 flex-1">
                  <div className="relative z-0 flex h-full w-full overflow-hidden">
                    <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
                    <div
                      className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden"
                      ref={contentRef}
                      tabIndex={-1}
                      style={
                        isSmallScreen
                          ? {
                              transform: navVisible
                                ? `translateX(${NAV_WIDTH.MOBILE}px)`
                                : 'translateX(0)',
                              transition: 'transform 0.2s ease-out',
                            }
                          : undefined
                      }
                      {...{ inert: navVisible && isSmallScreen ? '' : undefined }}
                    >
                      <MobileNav navVisible={navVisible} setNavVisible={setNavVisible} />
                      <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                    </div>
                  </div>
                </div>
                {/* For small screens, the widget blocks too much content, so hide then */}
                <div className="hidden md:block">
                  <feedback-widget show-comment-disclaimer="false" skip-email-step="true" />
                </div>
              </div>
            </PromptGroupsProvider>
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
