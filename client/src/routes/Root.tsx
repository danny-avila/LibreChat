import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import type { ContextType } from '~/common';
import { useAuthContext, useAssistantsMap, useFileMap, useSearch } from '~/hooks';
import { AssistantsMapContext, FileMapContext, SearchContext } from '~/Providers';
import { Nav, MobileNav } from '~/components/Nav';
import TermsAndConditionsModal from '~/components/ui/TermsAndConditionsModal';

export default function Root() {
  const { isAuthenticated, logout } = useAuthContext();
  const navigate = useNavigate();
  const [navVisible, setNavVisible] = useState<boolean>(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const search = useSearch({ isAuthenticated });
  const fileMap = useFileMap({ isAuthenticated });
  const assistantsMap = useAssistantsMap({ isAuthenticated });

  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const hasAcceptedTerms = localStorage.getItem('termsAccepted') === 'true';
      setShowTerms(!hasAcceptedTerms);
    }
  }, [isAuthenticated]);

  const handleAcceptTerms = () => {
    localStorage.setItem('termsAccepted', 'true');
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
          <div className="flex h-dvh">
            <div className="relative z-0 flex h-full w-full overflow-hidden">
              <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
              <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
                <MobileNav setNavVisible={setNavVisible} />
                <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
              </div>
            </div>
          </div>
          <TermsAndConditionsModal
            open={showTerms}
            onOpenChange={setShowTerms}
            onAccept={handleAcceptTerms}
            onDecline={handleDeclineTerms}
          />
        </AssistantsMapContext.Provider>
      </FileMapContext.Provider>
    </SearchContext.Provider>
  );
}
