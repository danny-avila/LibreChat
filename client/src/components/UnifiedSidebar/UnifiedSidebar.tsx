import { useCallback, useState, useEffect, useRef, memo } from 'react';
import { pxToRem, useRemScale } from '@librechat/client';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { ChatFormValues } from '~/common';
import {
  COLLAPSED_WIDTH,
  EXPANDED_MIN,
  TRANSITION_MS,
  EASING,
  SIDEBAR_TRANSITION,
  DRAWER_Z_INDEX,
  MOBILE_DRAWER_ID,
} from './constants';
import { ChatContext, ChatFormProvider, ActivePanelProvider } from '~/Providers';
import { MobileHeader, MobileBottomBar, MobileShortcutTargets } from './mobile';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import useSidebarState from '~/hooks/Nav/useSidebarState';
import { useChatHelpers, useLocalize } from '~/hooks';
import SidePanelNav from '~/components/SidePanel/Nav';
import Sidebar from './Sidebar';
import { cn } from '~/utils';

function getInitialWidth(): number {
  const saved = localStorage.getItem('side:width');
  return saved ? Math.max(Number(saved), EXPANDED_MIN) : EXPANDED_MIN;
}

/**
 * Isolates useChatHelpers Recoil subscriptions from the sidebar layout.
 * Atom changes (e.g. during streaming) only re-render this component
 * and the active panel — not the sidebar shell, resize logic, or icon strip.
 * This works because Recoil subscriptions don't propagate to parent components.
 */
function SidebarChatProvider({ children }: { children: ReactNode }) {
  const chatHelpers = useChatHelpers(0);
  const sidebarFormMethods = useForm<ChatFormValues>({ defaultValues: { text: '' } });
  return (
    <ChatFormProvider {...sidebarFormMethods}>
      <ChatContext.Provider value={chatHelpers}>{children}</ChatContext.Provider>
    </ChatFormProvider>
  );
}

function UnifiedSidebar() {
  const localize = useLocalize();
  const location = useLocation();
  const navigate = useNavigate();
  const { isSmallScreen, expanded } = useSidebarState();
  const { setSidebarOpen } = useSidebarToggle();
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);
  const remScale = useRemScale();
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandlers = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  const links = useUnifiedSidebarLinks();
  const isInsightsRoute = location.pathname.startsWith('/insights');
  const panelExpanded = expanded && !isInsightsRoute;

  const handleCollapse = useCallback(
    (afterSlide?: () => void) => {
      setSidebarOpen(false, afterSlide);
    },
    [setSidebarOpen],
  );

  const handleExpand = useCallback(() => {
    setSidebarOpen(true);
  }, [setSidebarOpen]);

  const handleLeaveInsights = useCallback(() => {
    navigate('/c/new');
  }, [navigate]);

  const handlePanelExpand = useCallback(() => {
    if (isInsightsRoute) {
      handleLeaveInsights();
    }
    handleExpand();
  }, [handleExpand, handleLeaveInsights, isInsightsRoute]);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    const maxWidth = (window.innerWidth * 0.4) / remScale;
    /** The scaled minimum can exceed the viewport cap, so it yields to the cap. */
    const minWidth = Math.min(EXPANDED_MIN, maxWidth);
    let rafId: number | null = null;

    const move = (e: MouseEvent) => {
      if (rafId != null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const next = Math.max(minWidth, Math.min(e.clientX / remScale, maxWidth));
        setSidebarWidth(next);
      });
    };

    const up = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.userSelect = '';
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
  }, [remScale]);

  const handleResizeKeyboard = useCallback(
    (direction: 'shrink' | 'grow') => {
      setSidebarWidth((w) => {
        const maxWidth = (window.innerWidth * 0.4) / remScale;
        /** A width stored at a lower scale can exceed the current maximum, so it
         *  is brought into range before stepping rather than crawling down by 20. */
        const current = Math.min(w, maxWidth);
        const next =
          direction === 'shrink'
            ? Math.max(current - 20, Math.min(EXPANDED_MIN, maxWidth))
            : Math.min(current + 20, maxWidth);
        localStorage.setItem('side:width', String(Math.round(next)));
        return next;
      });
    },
    [remScale],
  );

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
      if (e.key !== 'Escape') {
        return;
      }
      /**
       * Menus opened from the drawer portal out of it, so their Escape still
       * reaches this listener. Dismissing the whole drawer would skip the level
       * the user meant to leave.
       *
       * Presence alone is not the signal: not every menu unmounts when closed —
       * the account menu stays mounted and merely `hidden` — so matching those
       * too would suppress Escape for the drawer permanently.
       */
      if (document.querySelector('[role="menu"]:not([hidden])') != null) {
        return;
      }
      handleCollapse();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSmallScreen, expanded, handleCollapse]);

  if (isSmallScreen) {
    return (
      <div
        id={MOBILE_DRAWER_ID}
        className={cn(
          /** The close swipe reads horizontal touches here (the drawer holds no
           * horizontal scrollers), while pinch-zoom stays with the browser —
           * this full-viewport surface must not disable zooming entirely. */
          'fixed inset-y-0 left-0 flex w-full touch-pan-y touch-pinch-zoom flex-col bg-surface-primary-alt',
          expanded ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ transition: SIDEBAR_TRANSITION, zIndex: DRAWER_Z_INDEX }}
        inert={!expanded ? '' : undefined}
      >
        <SidebarChatProvider>
          <ActivePanelProvider>
            <MobileHeader
              links={links}
              expanded={expanded}
              onClose={handleCollapse}
              onLeaveInsights={handleLeaveInsights}
              routeActiveId={isInsightsRoute ? 'insights' : undefined}
            />
            <nav
              id="chat-history-nav"
              className="min-h-0 flex-1 overflow-hidden bg-surface-primary-alt"
            >
              <SidePanelNav links={links} />
            </nav>
            <MobileShortcutTargets
              links={links}
              onLeaveInsights={handleLeaveInsights}
              routeActiveId={isInsightsRoute ? 'insights' : undefined}
            />
            <MobileBottomBar links={links} onNewChat={handleCollapse} />
          </ActivePanelProvider>
        </SidebarChatProvider>
      </div>
    );
  }

  return (
    <SidebarChatProvider>
      <ActivePanelProvider>
        <aside
          className="relative flex h-full flex-shrink-0 overflow-hidden"
          style={{
            width: pxToRem(panelExpanded ? sidebarWidth : COLLAPSED_WIDTH),
            minWidth: panelExpanded
              ? `min(${pxToRem(EXPANDED_MIN)}, 40%)`
              : pxToRem(COLLAPSED_WIDTH),
            maxWidth: panelExpanded ? '40%' : pxToRem(COLLAPSED_WIDTH),
            transition: isResizing
              ? 'none'
              : `width ${TRANSITION_MS}ms ${EASING}, min-width ${TRANSITION_MS}ms ${EASING}, max-width ${TRANSITION_MS}ms ${EASING}`,
          }}
          aria-label={localize('com_nav_control_panel')}
        >
          <Sidebar
            links={links}
            expanded={panelExpanded}
            onCollapse={handleCollapse}
            onExpand={handlePanelExpand}
            onLeaveInsights={handleLeaveInsights}
            onResizeStart={handleResizeStart}
            onResizeKeyboard={handleResizeKeyboard}
          />
        </aside>
      </ActivePanelProvider>
    </SidebarChatProvider>
  );
}

export default memo(UnifiedSidebar);
