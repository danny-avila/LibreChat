import { useCallback, useState, useEffect, useRef, memo, startTransition } from 'react';
import type { ReactNode } from 'react';
import { useRecoilState } from 'recoil';
import { useForm } from 'react-hook-form';
import { useMediaQuery } from '@librechat/client';
import type { ChatFormValues } from '~/common';
import { ChatContext, ChatFormProvider, ActivePanelProvider } from '~/Providers';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import { useChatHelpers, useLocalize } from '~/hooks';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useIsExodeEmbed } from '~/components/Exode';
import ExpandedPanel from './ExpandedPanel';
import Sidebar from './Sidebar';
import { cn } from '~/utils';
import store from '~/store';

const COLLAPSED_WIDTH = 52;
const EXPANDED_MIN = 360;
const TRANSITION_MS = 300;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Exode embed only. The sidebar is closed by default and opens on hover, so collapsed is a
 * narrow strip to aim at rather than the icon rail's width (the rail is hidden in the embed).
 * Expanded is well under `EXPANDED_MIN`: the assistant iframe is ~26vw of the host page, and
 * 360px there would leave no room for the conversation it overlays.
 */
const EMBED_HOVER_STRIP = 12;
const EMBED_EXPANDED_WIDTH = 260;

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
  const mediaQueryIsSmallScreen = useMediaQuery('(max-width: 768px)');
  const [storedExpanded, setExpanded] = useRecoilState(store.sidebarExpanded);
  const isExodeEmbed = useIsExodeEmbed();
  /**
   * In the embed the sidebar starts closed and opens on hover.
   *
   * The iframe is a fraction of the host page (the assistant panel is ~26vw), so a
   * permanently docked conversation list costs more width than the chat can spare. Hover
   * is also the only affordance available: the embed hides the icon rail, and with it the
   * toggle that would otherwise re-open a collapsed sidebar — which is why this cannot
   * simply reuse the stored collapsed state.
   */
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const expanded = isExodeEmbed ? hoverExpanded : storedExpanded;
  /**
   * The embed's own viewport (an iframe sized to a fraction of the host page, e.g. the exode
   * assistant panel at ~26vw) is narrow enough to trip this media query even on a desktop host
   * — `(max-width: 768px)` measures the iframe document, not the outer window. Below it falls
   * into the small-screen branch: a `position: fixed`, `85vw`-wide slide-over drawer plus the
   * full `ExpandedPanel` icon rail (with `AccountSettings` etc.) that `Sidebar.tsx` already
   * excludes on the desktop path. Left alone, that drawer fills the entire iframe and duplicates
   * chrome the embed intentionally hides. The embed always takes the desktop path instead.
   */
  const isSmallScreen = isExodeEmbed ? false : mediaQueryIsSmallScreen;
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeHandlers = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

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

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    const maxWidth = window.innerWidth * 0.4;
    let rafId: number | null = null;

    const move = (e: MouseEvent) => {
      if (rafId != null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const next = Math.max(EXPANDED_MIN, Math.min(e.clientX, maxWidth));
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
  }, []);

  const handleResizeKeyboard = useCallback((direction: 'shrink' | 'grow') => {
    setSidebarWidth((w) => {
      const next =
        direction === 'shrink'
          ? Math.max(w - 20, EXPANDED_MIN)
          : Math.min(w + 20, window.innerWidth * 0.4);
      localStorage.setItem('side:width', String(Math.round(next)));
      return next;
    });
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
          inert={!expanded ? '' : undefined}
        >
          <SidebarChatProvider>
            <ActivePanelProvider>
              <ExpandedPanel links={links} onCollapse={handleCollapse} />
              <nav className="min-h-0 flex-1 overflow-hidden bg-surface-primary-alt">
                <SidePanelNav links={links} />
              </nav>
            </ActivePanelProvider>
          </SidebarChatProvider>
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
    <SidebarChatProvider>
      <ActivePanelProvider>
        <aside
          className={cn(
            'relative flex h-full flex-shrink-0 overflow-hidden',
            /* Overlays the chat instead of displacing it: in a narrow iframe, reserving
               the expanded width would squeeze the conversation to nothing every time
               the pointer crossed the edge. */
            isExodeEmbed && 'absolute left-0 top-0 z-[60]',
            isExodeEmbed && expanded && 'shadow-lg',
          )}
          style={
            isExodeEmbed
              ? {
                  /* Collapsed is a thin hover target, not the 52px icon rail — the rail is
                     hidden here, so a wider strip would just be empty space. */
                  width: expanded ? EMBED_EXPANDED_WIDTH : EMBED_HOVER_STRIP,
                  transition: `width ${TRANSITION_MS}ms ${EASING}`,
                }
              : {
                  width: expanded ? sidebarWidth : COLLAPSED_WIDTH,
                  minWidth: expanded ? EXPANDED_MIN : COLLAPSED_WIDTH,
                  maxWidth: expanded ? '40%' : COLLAPSED_WIDTH,
                  transition: isResizing
                    ? 'none'
                    : `width ${TRANSITION_MS}ms ${EASING}, min-width ${TRANSITION_MS}ms ${EASING}, max-width ${TRANSITION_MS}ms ${EASING}`,
                }
          }
          onMouseEnter={isExodeEmbed ? () => setHoverExpanded(true) : undefined}
          onMouseLeave={isExodeEmbed ? () => setHoverExpanded(false) : undefined}
          aria-label={localize('com_nav_control_panel')}
        >
          <Sidebar
            links={links}
            expanded={expanded}
            onCollapse={handleCollapse}
            onExpand={handleExpand}
            onResizeStart={handleResizeStart}
            onResizeKeyboard={handleResizeKeyboard}
          />
        </aside>
      </ActivePanelProvider>
    </SidebarChatProvider>
  );
}

export default memo(UnifiedSidebar);
