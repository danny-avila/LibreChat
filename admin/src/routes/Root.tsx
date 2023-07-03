import { useState } from 'react';
import { Sidebar, MobileNav } from '@/common';
import { Outlet } from 'react-router-dom';

function Root() {
  const [navVisible, setNavVisible] = useState(false);

  return (
    <div className="flex h-screen">
      <Sidebar navVisible={navVisible} setNavVisible={setNavVisible} />
      <main className="flex h-full w-full flex-1 flex-col bg-gray-50">
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white dark:bg-gray-800 md:pt-0">
          <MobileNav navVisible={navVisible} setNavVisible={setNavVisible} />
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Root;
