import { useCallback, useState, useEffect, useRef, memo, startTransition } from 'react';
import { useRecoilState } from 'recoil';
import { getConfigDefaults } from 'librechat-data-provider';
import { useMediaQuery } from '@librechat/client';
import { SidePanelProvider, ActivePanelProvider } from '~/Providers';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import ExpandedPanel from './ExpandedPanel';
import { useLocalize } from '~/hooks';
import Sidebar from './Sidebar';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;
const COLLAPSED_WIDTH = 50;
const TRANSITION_MS = 200;

function getInitialActivePanel(): string {
  const saved = localStorage.getItem('side:active-panel');
  return typeof saved === 'string' ? saved : 'conversations';
}

function getInitialWidth(): number {
  const saved = localStorage.getItem('side:width');
  return saved ? Number(saved) : 320;
}

function UnifiedSidebar() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useRecoilState(store.sidebarExpanded);
  const [activeSection, setActiveSection] = useState(getInitialActivePanel);
  const [sidebarWidth, _setSidebarWidth] = useState(getInitialWidth);
  const isResizing = useRef(false);
  const [isCollapsing, setIsCollapsing] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setIsCollapsing(true);
      const timer = setTimeout(() => setIsCollapsing(false), TRANSITION_MS);
      return () => clearTimeout(timer);
    }
    setIsCollapsing(false);
  }, [expanded]);

  const showExpanded = expanded || isCollapsing;

  const links = useUnifiedSidebarLinks({
    interfaceConfig: defaultInterface,
  });

  const handleCollapse = useCallback(() => {
    startTransition(() => {
      setExpanded(false);
    });
  }, [setExpanded]);

  const handleExpand = useCallback(() => {
    startTransition(() => {
      setExpanded(true);
    });
  }, [setExpanded]);

  const handleExpandToSection = useCallback(
    (sectionId: string) => {
      localStorage.setItem('side:active-panel', sectionId);
      setActiveSection(sectionId);
      startTransition(() => {
        setExpanded(true);
      });
    },
    [setExpanded],
  );

  if (isSmallScreen) {
    return (
      <>
        <div
          className={cn(
            'fixed left-0 top-0 z-[110] h-full bg-surface-primary-alt transition-transform duration-200 ease-out',
            expanded ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{ width: 300 }}
        >
          <SidePanelProvider>
            <ActivePanelProvider defaultActive={activeSection}>
              <ExpandedPanel links={links} onCollapse={handleCollapse} />
            </ActivePanelProvider>
          </SidePanelProvider>
        </div>
        {expanded && (
          <button
            className="nav-mask active"
            onClick={handleCollapse}
            aria-label={localize('com_nav_close_sidebar')}
          />
        )}
      </>
    );
  }

  return (
    <SidePanelProvider>
      <ActivePanelProvider defaultActive={activeSection}>
        <aside
          className="relative flex h-full flex-shrink-0 overflow-hidden"
          style={{
            width: expanded ? sidebarWidth : COLLAPSED_WIDTH,
            minWidth: expanded ? 360 : COLLAPSED_WIDTH,
            maxWidth: expanded ? '40%' : COLLAPSED_WIDTH,
            transition: isResizing.current
              ? 'none'
              : `width ${TRANSITION_MS}ms ease-out, min-width ${TRANSITION_MS}ms ease-out, max-width ${TRANSITION_MS}ms ease-out`,
          }}
          aria-label={localize('com_nav_control_panel')}
        >
          <Sidebar
            links={links}
            onCollapse={handleCollapse}
            showExpanded={showExpanded}
            onResizeStart={(e) => (isResizing.current = true)}
            setSidebarWidth={_setSidebarWidth}
          />
        </aside>
      </ActivePanelProvider>
    </SidePanelProvider>
  );
}

export default memo(UnifiedSidebar);
