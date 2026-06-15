import { useCallback, useState, useEffect, memo, startTransition } from 'react';
import type { ReactNode } from 'react';
import { useRecoilState } from 'recoil';
import { useForm } from 'react-hook-form';
import { useMediaQuery } from '@librechat/client';
import type { ChatFormValues } from '~/common';
import { ChatContext, ChatFormProvider, ActivePanelProvider } from '~/Providers';
import useUnifiedSidebarLinks from '~/hooks/Nav/useUnifiedSidebarLinks';
import { useChatHelpers, useLocalize } from '~/hooks';
import SidePanelNav from '~/components/SidePanel/Nav';
import ExpandedPanel from './ExpandedPanel';
import Sidebar from './Sidebar';
import { cn } from '~/utils';
import store from '~/store';

const COLLAPSED_WIDTH = 52;
const SIDEBAR_WIDTH = 260;
const TRANSITION_MS = 300;
const SNAP_MS = 150;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Isolates useChatHelpers Recoil subscriptions from the sidebar layout.
 * Atom changes (e.g. during streaming) only re-render this component
 * and the active panel — not the sidebar shell or icon strip.
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
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useRecoilState(store.sidebarExpanded);

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
          className="relative flex h-full flex-shrink-0 overflow-hidden"
          style={{
            width: expanded ? SIDEBAR_WIDTH : COLLAPSED_WIDTH,
            minWidth: expanded ? SIDEBAR_WIDTH : COLLAPSED_WIDTH,
            maxWidth: expanded ? SIDEBAR_WIDTH : COLLAPSED_WIDTH,
            // Collapsing: let FullSidebar slide out first (TRANSITION_MS), then snap the width.
            // Expanding: grow the aside immediately so FullSidebar has room to slide into.
            transition: expanded
              ? `width ${TRANSITION_MS}ms ${EASING}, min-width ${TRANSITION_MS}ms ${EASING}, max-width ${TRANSITION_MS}ms ${EASING}`
              : `width ${SNAP_MS}ms ${EASING} ${TRANSITION_MS}ms, min-width ${SNAP_MS}ms ${EASING} ${TRANSITION_MS}ms, max-width ${SNAP_MS}ms ${EASING} ${TRANSITION_MS}ms`,
          }}
          aria-label={localize('com_nav_control_panel')}
        >
          <Sidebar
            links={links}
            expanded={expanded}
            onCollapse={handleCollapse}
            onExpand={handleExpand}
          />
        </aside>
      </ActivePanelProvider>
    </SidebarChatProvider>
  );
}

export default memo(UnifiedSidebar);
