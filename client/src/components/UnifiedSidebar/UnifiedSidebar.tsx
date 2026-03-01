import { useCallback, useState, useEffect, useRef, memo, startTransition } from 'react';
import { useRecoilState } from 'recoil';
import { getConfigDefaults } from 'librechat-data-provider';
import { useMediaQuery } from '@librechat/client';
import { SidePanelProvider, ActivePanelProvider } from '~/Providers';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import ConversationsSection from './ConversationsSection';
import ExpandedPanel from './ExpandedPanel';
import CollapsedBar from './CollapsedBar';
import { useLocalize } from '~/hooks';
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
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);
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
    ConversationsComponent: ConversationsSection,
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

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) {
        return;
      }
      const newWidth = Math.min(Math.max(moveEvent.clientX, 220), window.innerWidth * 0.4);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSidebarWidth((w) => {
        localStorage.setItem('side:width', String(Math.round(w)));
        return w;
      });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

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
              <ExpandedPanel
                links={links}
                defaultActive={activeSection}
                onCollapse={handleCollapse}
              />
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
            minWidth: expanded ? 220 : COLLAPSED_WIDTH,
            maxWidth: expanded ? '40%' : COLLAPSED_WIDTH,
            transition: isResizing.current
              ? 'none'
              : `width ${TRANSITION_MS}ms ease-out, min-width ${TRANSITION_MS}ms ease-out, max-width ${TRANSITION_MS}ms ease-out`,
          }}
          aria-label={localize('com_nav_control_panel')}
        >
          {showExpanded ? (
            <>
              <div className="h-full" style={{ minWidth: sidebarWidth }}>
                <ExpandedPanel
                  links={links}
                  defaultActive={activeSection}
                  onCollapse={handleCollapse}
                />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                tabIndex={0}
                className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-border-medium active:bg-border-heavy"
                onMouseDown={handleResizeStart}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') {
                    setSidebarWidth((w) => {
                      const next = Math.max(w - 20, 220);
                      localStorage.setItem('side:width', String(next));
                      return next;
                    });
                  } else if (e.key === 'ArrowRight') {
                    setSidebarWidth((w) => {
                      const next = Math.min(w + 20, window.innerWidth * 0.4);
                      localStorage.setItem('side:width', String(Math.round(next)));
                      return next;
                    });
                  }
                }}
              />
            </>
          ) : (
            <CollapsedBar
              links={links}
              onExpand={handleExpand}
              onExpandToSection={handleExpandToSection}
            />
          )}
        </aside>
      </ActivePanelProvider>
    </SidePanelProvider>
  );
}

export default memo(UnifiedSidebar);
