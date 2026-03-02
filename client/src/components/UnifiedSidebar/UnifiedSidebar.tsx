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
const COLLAPSED_WIDTH = 52;
const EXPANDED_MIN = 360;
const TRANSITION_MS = 300;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

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
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);
  const isResizing = useRef(false);

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
            'fixed left-0 top-0 z-[110] h-full bg-surface-primary-alt',
            expanded ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{
            width: 300,
            transition: `transform ${TRANSITION_MS}ms ${EASING}`,
          }}
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
            minWidth: expanded ? EXPANDED_MIN : COLLAPSED_WIDTH,
            maxWidth: expanded ? '40%' : COLLAPSED_WIDTH,
            transition: isResizing.current
              ? 'none'
              : `width ${TRANSITION_MS}ms ${EASING}, min-width ${TRANSITION_MS}ms ${EASING}, max-width ${TRANSITION_MS}ms ${EASING}`,
          }}
          aria-label={localize('com_nav_control_panel')}
        >
          <Sidebar
            links={links}
            expanded={expanded}
            onCollapse={handleCollapse}
            onExpand={handleExpand}
            onExpandToSection={handleExpandToSection}
            onResizeStart={() => (isResizing.current = true)}
            setSidebarWidth={setSidebarWidth}
          />
        </aside>
      </ActivePanelProvider>
    </SidePanelProvider>
  );
}

export default memo(UnifiedSidebar);
