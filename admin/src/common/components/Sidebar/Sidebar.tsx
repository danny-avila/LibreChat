import { useState, useEffect, useRef } from 'react';
import { Sidebar as SidebarPrime } from 'primereact/sidebar';
import { useNavigate } from 'react-router-dom';
import Panel from '~/components/svg/Panel';

type TSidebarProps = {
  navVisible: boolean;
  setNavVisible: (navVisible: boolean) => void;
};

function Sidebar({ navVisible, setNavVisible }: TSidebarProps) {
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef(null);

  const toggleNavVisible = () => {
    setNavVisible(!navVisible);
  };

  const isMobile = () => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobileRegex =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    return mobileRegex.test(userAgent);
  };

  useEffect(() => {
    if (isMobile()) {
      setNavVisible(false);
    } else {
      setNavVisible(true);
    }
  }, [setNavVisible]);

  return (
    <div
      className={
        'nav border-r-1 border-gray-500 bg-gray-50 shadow-md dark:bg-gray-900 md:inset-y-0' +
        (navVisible ? ' active' : '')
      }
    >
      <div className="flex h-full min-h-0 flex-col ">
        <div className="scrollbar-trigger relative flex h-full w-full flex-1 items-start border-white/20">
          <nav className="relative flex h-full flex-1 flex-col space-y-1 p-2">
            <div className="flex items-center">
              <img
                src="/assets/LibreChatWideMargin.svg"
                alt="LibreChat Logo"
                className="mr-2 h-12 w-12"
              />
              <h1 className="text-2xl font-bold">LibreChat</h1>
            </div>
            <div
              className={`flex-1 flex-col overflow-y-auto ${
                isHovering ? '' : 'scrollbar-transparent'
              } border-b border-white/20`}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              ref={containerRef}
            >
              <div className="flex h-full flex-col gap-2">Links</div>
            </div>
            Lower Links
          </nav>
        </div>
        <button
          type="button"
          className="nav-close-button -ml-0.5 -mt-2.5 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-white dark:text-gray-500 dark:hover:text-gray-400 md:-ml-1 md:-mt-2.5"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Close sidebar</span>
          <Panel />
        </button>
      </div>
      {!navVisible && (
        <button
          type="button"
          className="nav-open-button fixed left-2 top-0.5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-white dark:text-gray-500 dark:hover:text-gray-400"
          onClick={toggleNavVisible}
        >
          <span className="sr-only">Open sidebar</span>
          <Panel open={true} />
        </button>
      )}
      <div className={'nav-mask' + (navVisible ? ' active' : '')} onClick={toggleNavVisible}></div>
    </div>
  );
}
export default Sidebar;
