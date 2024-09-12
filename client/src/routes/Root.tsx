import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useUserTermsQuery } from '~/data-provider';

import type { ContextType } from '~/common';
import { AgentsMapContext, AssistantsMapContext, FileMapContext, SearchContext } from '~/Providers';
import { useAuthContext, useAssistantsMap, useAgentsMap, useFileMap, useSearch } from '~/hooks';
import { Nav, MobileNav } from '~/components/Nav';
import TermsAndConditionsModal from '~/components/ui/TermsAndConditionsModal';

export default function Root() {
  const { isAuthenticated, logout, token } = useAuthContext();
  const navigate = useNavigate();
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const search = useSearch({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });
  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const agentsMap = useAgentsMap({ isAuthenticated });

  const [showTerms, setShowTerms] = useState(false);
  const { data: config } = useGetStartupConfig();

  const { data: termsData } = useUserTermsQuery({
    enabled: isAuthenticated && !!config?.interface?.termsOfService?.modalAcceptance,
  });

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
    logout();
    navigate('/login');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SearchContext.Provider value={search}>
      <FileMapContext.Provider value={fileMap}>
        <AssistantsMapContext.Provider value={assistantsMap}>
          <AgentsMapContext.Provider value={agentsMap}>
            <div className="flex h-dvh h-screen">
              <div className="relative z-0 flex h-full w-full overflow-hidden">
                <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
                <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                  <MobileNav setNavVisible={setNavVisible} />
                  <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
                </div>
              </div>
            </div>
          </AgentsMapContext.Provider>
          {config?.interface?.termsOfService?.modalAcceptance && (
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
    </SearchContext.Provider>
  );
}
