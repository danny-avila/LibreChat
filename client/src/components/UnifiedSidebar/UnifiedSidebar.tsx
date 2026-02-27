import { useCallback, useMemo, memo, startTransition } from 'react';
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

function UnifiedSidebar() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useRecoilState(store.sidebarExpanded);

  const defaultActive = useMemo(() => {
    const activePanel = localStorage.getItem('side:active-panel');
    return typeof activePanel === 'string' ? activePanel : 'conversations';
  }, []);

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
          style={{ width: 320 }}
        >
          <SidePanelProvider>
            <ActivePanelProvider defaultActive={defaultActive}>
              <ExpandedPanel
                links={links}
                defaultActive={defaultActive}
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

  if (!expanded) {
    return (
      <SidePanelProvider>
        <CollapsedBar links={links} onExpandToSection={handleExpandToSection} />
      </SidePanelProvider>
    );
  }

  return (
    <SidePanelProvider>
      <ActivePanelProvider defaultActive={defaultActive}>
        <aside
          className="flex h-full flex-shrink-0 border-r border-border-light"
          style={{ width: 320, minWidth: 260, maxWidth: '40%' }}
          aria-label={localize('com_nav_control_panel')}
        >
          <ExpandedPanel links={links} defaultActive={defaultActive} onCollapse={handleCollapse} />
        </aside>
      </ActivePanelProvider>
    </SidePanelProvider>
  );
}

export default memo(UnifiedSidebar);
