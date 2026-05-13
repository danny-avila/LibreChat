import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { Outlet } from 'react-router-dom';
import DevDebugOverlayLoader from '~/components/Dev/DevDebugOverlayLoader';
import type { ContextType } from '~/common';
import { Banner } from '~/components/Banners';
import { MobileNav, Nav } from '~/components/Nav';
import AnnouncementModal from '~/components/ui/AnnouncementModal';
import TermsAndConditionsModal from '~/components/ui/TermsAndConditionsModal';
import { useGetStartupConfig, useHealthCheck, useUserTermsQuery } from '~/data-provider';
import {
  useAgentsMap,
  useAssistantsMap,
  useAuthContext,
  useFileMap,
  useSearchEnabled,
} from '~/hooks';
import {
  AgentsMapContext,
  AssistantsMapContext,
  FileMapContext,
  ModelDescriptionsProvider,
  PromptGroupsProvider,
  SetConvoProvider,
} from '~/Providers';
import store from '~/store';

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const { isAuthenticated, logout } = useAuthContext();

  // Global health check - runs once per authenticated session
  useHealthCheck(isAuthenticated);

  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });

  const { data: config } = useGetStartupConfig();
  const [dismissedAnnouncements, setDismissedAnnouncements] = useRecoilState<string[]>(
    store.dismissedAnnouncements,
  );
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

  const announcement = config?.interface?.announcement;
  const isAnnouncementEligible =
    announcement?.id != null &&
    announcement.id !== '' &&
    !dismissedAnnouncements.includes(announcement.id);
  const showAnnouncementModal = isAnnouncementEligible && !showTerms;

  const handleDismissAnnouncement = () => {
    if (
      announcement?.id != null &&
      announcement.id !== '' &&
      !dismissedAnnouncements.includes(announcement.id)
    ) {
      setDismissedAnnouncements([...dismissedAnnouncements, announcement.id]);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SetConvoProvider>
      <ModelDescriptionsProvider>
        <FileMapContext.Provider value={fileMap}>
          <AssistantsMapContext.Provider value={assistantsMap}>
            <AgentsMapContext.Provider value={agentsMap}>
              <PromptGroupsProvider>
                <Banner onHeightChange={setBannerHeight} />
                <div className="flex" style={{ height: `calc(100dvh - ${bannerHeight}px)` }}>
                  <div className="relative z-0 flex h-full w-full overflow-hidden">
                    <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
                    <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                      <MobileNav setNavVisible={setNavVisible} />
                      <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                      <DevDebugOverlayLoader />
                    </div>
                  </div>
                </div>
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
                {showAnnouncementModal === true && announcement != null ? (
                  <AnnouncementModal
                    open={showAnnouncementModal}
                    announcement={announcement}
                    onDismiss={handleDismissAnnouncement}
                  />
                ) : null}
              </PromptGroupsProvider>
            </AgentsMapContext.Provider>
          </AssistantsMapContext.Provider>
        </FileMapContext.Provider>
      </ModelDescriptionsProvider>
    </SetConvoProvider>
  );
}
