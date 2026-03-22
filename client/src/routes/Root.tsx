import React, { useState, useEffect } from 'react';
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
import { TermsAndConditionsModal, ImportantNoticeModal } from '~/components/ui';
import { useHealthCheck } from '~/data-provider';

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [showTestingNotice, setShowTestingNotice] = useState(false);
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const { isAuthenticated, logout, user } = useAuthContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

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

  const noticeKey = `hasAcceptedTestingNotice_${user?.id ?? 'guest'}`;

  useEffect(() => {
    if (termsData) {
      setShowTerms(!termsData.termsAccepted);
      if (termsData.termsAccepted) {
        const hasAcceptedNotice = localStorage.getItem(noticeKey);
        if (!hasAcceptedNotice) {
          setShowTestingNotice(true);
        }
      }
    }
  }, [termsData, noticeKey]);

  const handleAcceptTerms = () => {
    setShowTerms(false);
    const hasAcceptedNotice = localStorage.getItem(noticeKey);
    if (!hasAcceptedNotice) {
      setShowTestingNotice(true);
    }
  };

  const handleDeclineTerms = () => {
    setShowTerms(false);
    logout('/login?redirect=false');
  };

  const handleAcceptTestingNotice = () => {
    localStorage.setItem(noticeKey, 'true');
    setShowTestingNotice(false);
  };

  const handleDeclineTestingNotice = () => {
    setShowTestingNotice(false);
    logout('/login');
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
              <div className="flex h-dvh">
                <div className="relative z-0 flex h-full w-full overflow-hidden">
                  <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
                  <div
                    className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden"
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
                  >
                    <MobileNav navVisible={navVisible} setNavVisible={setNavVisible} />
                    <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                  </div>
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
          <ImportantNoticeModal
            open={showTestingNotice}
            onOpenChange={setShowTestingNotice}
            onAccept={handleAcceptTestingNotice}
            onDecline={handleDeclineTestingNotice}
          />
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SetConvoProvider>
  );
}
