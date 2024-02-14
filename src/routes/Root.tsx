/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { ContextType } from '~/common';
import { Nav, MobileNav } from '~/components/Nav';
import { useAuthStore } from '~/zustand';

export default function Root() {
  const { isAuthenticated } = useAuthStore();
  const [navVisible, setNavVisible] = useState(() => {
    const savedNavVisible = localStorage.getItem('navVisible');
    return savedNavVisible !== null ? JSON.parse(savedNavVisible) : true;
  });

  if (!isAuthenticated()) {
    return null;
  }

  return (
    <>
      <div className="flex h-dvh">
        <div className="relative z-0 flex h-full w-full overflow-hidden">
          <Nav navVisible={navVisible} setNavVisible={setNavVisible} />
          <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
            <MobileNav setNavVisible={setNavVisible} />
            <Outlet context={{ navVisible, setNavVisible } satisfies ContextType} />
          </div>
        </div>
      </div>
    </>
  );
}
