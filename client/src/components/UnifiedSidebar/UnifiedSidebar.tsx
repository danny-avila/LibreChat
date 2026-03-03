import { useCallback, useState, useEffect, useRef, memo, startTransition } from 'react';
import { useRecoilState } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import { ChatContext, ActivePanelProvider } from '~/Providers';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import { useChatHelpers, useLocalize } from '~/hooks';
import Sidebar from './Sidebar';
import { cn } from '~/utils';
import store from '~/store';

const COLLAPSED_WIDTH = 52;
const EXPANDED_MIN = 360;
const TRANSITION_MS = 300;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

function getInitialActivePanel(): string {
  const saved = localStorage.getItem('side:active-panel');
  return saved && saved.length > 0 ? saved : 'conversations';
}

function getInitialWidth(): number {
  const saved = localStorage.getItem('side:width');
  return saved ? Math.max(Number(saved), EXPANDED_MIN) : EXPANDED_MIN;
}

function UnifiedSidebar() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useRecoilState(store.sidebarExpanded);
  const [activeSection, setActiveSection] = useState(getInitialActivePanel);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandlers = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  const chatHelpers = useChatHelpers(0);
  const links = useUnifiedSidebarLinks();

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

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
    const maxWidth = window.innerWidth * 0.4;

    const move = (e: MouseEvent) => {
      const next = Math.max(EXPANDED_MIN, Math.min(e.clientX, maxWidth));
      setSidebarWidth(next);
    };

    const up = () => {
      setIsResizing(false);
      resizeHandlers.current = null;
      setSidebarWidth((w) => {
        localStorage.setItem('side:width', String(Math.round(w)));
        return w;
      });
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };

    resizeHandlers.current = { move, up };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, []);

  useEffect(() => {
    return () => {
      if (resizeHandlers.current) {
        document.removeEventListener('mousemove', resizeHandlers.current.move);
        document.removeEventListener('mouseup', resizeHandlers.current.up);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSmallScreen || !expanded) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCollapse();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSmallScreen, expanded, handleCollapse]);

  if (isSmallScreen) {
    return (
      <>
        <div
          className={cn(
            'fixed left-0 top-0 z-[110] flex h-full bg-surface-primary-alt',
            expanded ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{
            width: 'min(85vw, 380px)',
            transition: `transform ${TRANSITION_MS}ms ${EASING}`,
          }}
        >
          <ChatContext.Provider value={chatHelpers}>
            <ActivePanelProvider defaultActive={activeSection}>
              <ExpandedPanel links={links} onCollapse={handleCollapse} />
              <nav className="min-h-0 flex-1 overflow-hidden bg-surface-primary-alt">
                <SidePanelNav links={links} />
              </nav>
            </ActivePanelProvider>
          </ChatContext.Provider>
        </div>
        <div
          className={cn(
            'fixed inset-0 z-[109] bg-black/50',
            expanded ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}
          style={{ transition: `opacity ${TRANSITION_MS}ms ${EASING}` }}
          role="presentation"
        >
          <button
            className="h-full w-full"
            onClick={handleCollapse}
            aria-label={localize('com_nav_close_sidebar')}
            tabIndex={expanded ? 0 : -1}
          />
        </div>
      </>
    );
  }

  return (
    <ChatContext.Provider value={chatHelpers}>
      <ActivePanelProvider defaultActive={activeSection}>
        <aside
          className="relative flex h-full flex-shrink-0 overflow-hidden"
          style={{
            width: expanded ? sidebarWidth : COLLAPSED_WIDTH,
            minWidth: expanded ? EXPANDED_MIN : COLLAPSED_WIDTH,
            maxWidth: expanded ? '40%' : COLLAPSED_WIDTH,
            transition: isResizing
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
            onResizeStart={handleResizeStart}
            setSidebarWidth={setSidebarWidth}
          />
        </aside>
      </ActivePanelProvider>
    </ChatContext.Provider>
  );
}

export default memo(UnifiedSidebar);
