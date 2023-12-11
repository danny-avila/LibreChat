/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Outlet, useLocation } from 'react-router-dom';
import { useGetModelsQuery, useGetSearchEnabledQuery } from 'librechat-data-provider/react-query';
import type { ContextType } from '~/common';
import { useAuthContext, useServerStream, useConversation } from '~/hooks';
import { Nav, MobileNav } from '~/components/Nav';
import store from '~/store';

export default function Root() {
  const location = useLocation();
  const { newConversation } = useConversation();
  const { isAuthenticated } = useAuthContext();
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  const submission = useRecoilValue(store.submission);
  useServerStream(submission ?? null);

  const modelsQueryEnabled = useRecoilValue(store.modelsQueryEnabled);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setModelsConfig = useSetRecoilState(store.modelsConfig);

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated && modelsQueryEnabled });

  useEffect(() => {
    localStorage.setItem('navVisible', JSON.stringify(navVisible));
  }, [navVisible]);

  useEffect(() => {
    if (modelsQuery.data && location.state?.from?.pathname.includes('/chat')) {
      setModelsConfig(modelsQuery.data);
      // Note: passing modelsQuery.data prevents navigation
      newConversation({}, undefined, modelsQuery.data);
    } else if (modelsQuery.data) {
      setModelsConfig(modelsQuery.data);
    } else if (modelsQuery.isError) {
      console.error('Failed to get models', modelsQuery.error);
    }
  }, [modelsQuery.data, modelsQuery.isError]);

  useEffect(() => {
    if (searchEnabledQuery.data) {
      setIsSearchEnabled(searchEnabledQuery.data);
    } else if (searchEnabledQuery.isError) {
      console.error('Failed to get search enabled', searchEnabledQuery.error);
    }
  }, [searchEnabledQuery.data, searchEnabledQuery.isError]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <div className="flex h-screen">
        <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
        <div className="relative z-0 flex h-full w-full overflow-hidden">
          <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
            <MobileNav setNavVisible={setNavVisible} />
            <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
          </div>
        </div>
      </div>
    </>
  );
}
