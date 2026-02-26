import { useRef, useCallback, useEffect } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { ResizablePanelGroup, ResizablePanel, ResizableHandleAlt } from '@librechat/client';
import type { ContextType } from '~/common';
import Nav, { NAV_WIDTH } from './Nav';
import MobileNav from './MobileNav';

interface ResizableNavProps {
  navVisible: boolean;
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSmallScreen: boolean;
  children: (context: ContextType) => React.ReactNode;
}

export default function ResizableNav({
  navVisible,
  setNavVisible,
  isSmallScreen,
  children,
}: ResizableNavProps) {
  const navPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync panel state with navVisible prop on mount and when switching to desktop
  useEffect(() => {
    if (!isSmallScreen && navPanelRef.current) {
      const isCollapsed = navPanelRef.current.isCollapsed();

      // Only update if there's a mismatch between prop and panel state
      if (navVisible && isCollapsed) {
        navPanelRef.current.expand();
      } else if (!navVisible && !isCollapsed) {
        navPanelRef.current.collapse();
      }
    }
  }, [navVisible, isSmallScreen]);

  // Custom setNavVisible that also controls the resizable panel
  const handleSetNavVisible = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setNavVisible((prev) => {
        const newValue = typeof value === 'function' ? value(prev) : value;

        // Control the resizable panel on desktop
        if (!isSmallScreen && navPanelRef.current) {
          if (newValue) {
            navPanelRef.current.expand();
          } else {
            navPanelRef.current.collapse();
          }
        }

        if (typeof value === 'boolean') {
          localStorage.setItem('navVisible', JSON.stringify(newValue));
        }
        return newValue;
      });
    },
    [isSmallScreen, setNavVisible],
  );

  const context: ContextType = { navVisible, setNavVisible: handleSetNavVisible };

  // Mobile: Original overlay behavior
  if (isSmallScreen) {
    return (
      <>
        <Nav navVisible={navVisible} setNavVisible={handleSetNavVisible} />
        <div
          className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden"
          style={{
            transform: navVisible ? `translateX(${NAV_WIDTH.MOBILE}px)` : 'translateX(0)',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <MobileNav navVisible={navVisible} setNavVisible={handleSetNavVisible} />
          {children(context)}
        </div>
      </>
    );
  }

  // Desktop: Resizable panel layout
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full" autoSaveId="nav-layout">
      <ResizablePanel
        ref={navPanelRef}
        defaultSize={navVisible ? 15 : 0}
        minSize={15}
        maxSize={35}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => {
          handleSetNavVisible(false);
        }}
        onExpand={() => {
          handleSetNavVisible(true);
        }}
      >
        <Nav navVisible={navVisible} setNavVisible={handleSetNavVisible} />
      </ResizablePanel>
      <ResizableHandleAlt withHandle className="w-px" />
      <ResizablePanel defaultSize={85} minSize={65}>
        <div className="relative flex h-full max-w-full flex-1 flex-col overflow-hidden">
          <MobileNav navVisible={navVisible} setNavVisible={handleSetNavVisible} />
          {children(context)}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
