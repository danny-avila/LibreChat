import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { useGetSearchEnabledQuery } from 'librechat-data-provider/react-query';
import type { ContextType } from '~/common';
import { useAuthContext, useAssistantsMap, useFileMap } from '~/hooks';
import { AssistantsMapContext, FileMapContext } from '~/Providers';
import { Nav, MobileNav } from '~/components/Nav';
import store from '~/store';

export default function Root() {
  const { isAuthenticated } = useAuthContext();
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);

  const fileMap = useFileMap({ isAuthenticated });
  const assistantsMap = useAssistantsMap({ isAuthenticated });
  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });

  useEffect(() => {
    if (searchEnabledQuery.data) {
      setIsSearchEnabled(searchEnabledQuery.data);
    } else if (searchEnabledQuery.isError) {
      console.error('Failed to get search enabled', searchEnabledQuery.error);
    }
  }, [
    searchEnabledQuery.data,
    searchEnabledQuery.error,
    searchEnabledQuery.isError,
    setIsSearchEnabled,
  ]);

  if (!isAuthenticated) {
    return null;
  }

  return (
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
      </AssistantsMapContext.Provider>
    </FileMapContext.Provider>
  );
}
