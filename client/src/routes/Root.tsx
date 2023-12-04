/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Outlet, useLocation } from 'react-router-dom';
import {
  useGetModelsQuery,
  useGetPresetsQuery,
  useGetSearchEnabledQuery,
} from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { Nav, MobileNav } from '~/components/Nav';
import { useAuthContext, useServerStream, useConversation } from '~/hooks';
import store from '~/store';

export default function Root() {
  const location = useLocation();
  const { newConversation } = useConversation();
  const { user, isAuthenticated } = useAuthContext();
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : false;
  });

  const submission = useRecoilValue(store.submission);
  useServerStream(submission ?? null);

  const setPresets = useSetRecoilState(store.presets);
  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setModelsConfig = useSetRecoilState(store.modelsConfig);

  const searchEnabledQuery = useGetSearchEnabledQuery({ enabled: isAuthenticated });
  const modelsQuery = useGetModelsQuery({ enabled: isAuthenticated });
  const presetsQuery = useGetPresetsQuery({ enabled: !!user });

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
    if (presetsQuery.data) {
      setPresets(presetsQuery.data);
    } else if (presetsQuery.isError) {
      console.error('Failed to get presets', presetsQuery.error);
    }
  }, [presetsQuery.data, presetsQuery.isError]);

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
        <div className="flex h-full w-full flex-1 flex-col bg-gray-50">
          <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-10 dark:bg-gray-800 md:pt-0">
            <MobileNav setNavVisible={setNavVisible} />
            <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
          </div>
        </div>
      </div>
    </>
  );
}
