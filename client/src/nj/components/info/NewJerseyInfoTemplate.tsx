import useAuthRedirect from '~/routes/useAuthRedirect';
import SimpleHeader from '~/nj/components/SimpleHeader';
import { Outlet, useLocation } from 'react-router-dom';
import { useGetStartupConfig } from '~/data-provider';
import useGoogleTagManager from '~/nj/hooks/useGoogleTagManager';
import { useEffect, useRef } from 'react';

/**
 * Template for internal information pages.
 */
export default function NewJerseyInfoTemplate() {
  const { isAuthenticated } = useAuthRedirect();
  const { data: startupConfig } = useGetStartupConfig();
  const { pathname } = useLocation();
  const scrollableRef = useRef<HTMLDivElement>(null);

  // If we switch between different info pages, reset the scroll
  useEffect(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTop = 0;
    }
  }, [pathname]);

  useGoogleTagManager({ startupConfig });

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <SimpleHeader />
      <div
        className="flex flex-1 flex-col items-center overflow-y-scroll pt-16"
        ref={scrollableRef}
      >
        <div className="mb-12 mt-6 w-full px-4 md:max-w-[47rem] xl:max-w-[55rem]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
