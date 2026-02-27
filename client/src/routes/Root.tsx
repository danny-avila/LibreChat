import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { ChatFormValues } from '~/common';
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
  ChatFormProvider,
} from '~/Providers';
import { useUserTermsQuery, useGetStartupConfig } from '~/data-provider';
import { UnifiedSidebar } from '~/components/UnifiedSidebar';
import { TermsAndConditionsModal } from '~/components/ui';
import { useHealthCheck } from '~/data-provider';
import { Banner } from '~/components/Banners';

export default function Root() {
  const [showTerms, setShowTerms] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);

  const { isAuthenticated, logout } = useAuthContext();

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

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ChatFormProvider {...methods}>
      <SetConvoProvider>
        <FileMapContext.Provider value={fileMap}>
          <AssistantsMapContext.Provider value={assistantsMap}>
            <AgentsMapContext.Provider value={agentsMap}>
              <PromptGroupsProvider>
                <Banner onHeightChange={setBannerHeight} />
                <div className="flex" style={{ height: `calc(100dvh - ${bannerHeight}px)` }}>
                  <div className="relative z-0 flex h-full w-full overflow-hidden">
                    <UnifiedSidebar />
                    <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                      <Outlet />
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
          </AssistantsMapContext.Provider>
        </FileMapContext.Provider>
      </SetConvoProvider>
    </ChatFormProvider>
  );
}
