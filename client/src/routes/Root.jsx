/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import {
  useGetEndpointsQuery,
  useGetPresetsQuery,
  useGetSearchEnabledQuery,
} from 'librechat-data-provider';

import MessageHandler from '../components/MessageHandler';
import { Nav, MobileNav } from '../components/Nav';
import { Outlet } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

export default function Root() {
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : false;
  });

  const setIsSearchEnabled = useSetRecoilState(store.isSearchEnabled);
  const setEndpointsConfig = useSetRecoilState(store.endpointsConfig);
  const setPresets = useSetRecoilState(store.presets);
  const { user, isAuthenticated, token } = useAuthContext();

  const searchEnabledQuery = useGetSearchEnabledQuery();
  const endpointsQuery = useGetEndpointsQuery();
  const presetsQuery = useGetPresetsQuery({ enabled: !!user });

  const checkTokenExpiration = (token) => {
    let tokenParts = token.split('.');
    let base64Url = tokenParts[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let tokenPayloadJson = window.atob(base64);
    let tokenPayload = JSON.parse(tokenPayloadJson);
    const currentTime = Date.now() / 1000; 
    const timeLeft = tokenPayload.exp - currentTime; 
    return timeLeft < 30;
  };  

  if (token) {
    if (checkTokenExpiration(token)) {
      window.dispatchEvent(new CustomEvent('attemptRefresh'));
    }
  }
  
  useEffect(() => {
    localStorage.setItem('navVisible', JSON.stringify(navVisible));
  }, [navVisible]);

  useEffect(() => {
    if (endpointsQuery.data) {
      setEndpointsConfig(endpointsQuery.data);
    } else if (endpointsQuery.isError) {
      console.error('Failed to get endpoints', endpointsQuery.error);
    }
  }, [endpointsQuery.data, endpointsQuery.isError]);

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
    //if (checkTokenExpiration(token)) {
      window.dispatchEvent(new CustomEvent('attemptRefresh'));
    //}
    return null;
  }

  return (
    <>
      <div className="flex h-screen">
        <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
        <div className="flex h-full w-full flex-1 flex-col bg-gray-50">
          <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-10 dark:bg-gray-800 md:pt-0">
            <MobileNav setNavVisible={setNavVisible} />
            <Outlet />
          </div>
        </div>
      </div>
      <MessageHandler />
    </>
  );
}
