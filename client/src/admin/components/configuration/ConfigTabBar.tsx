import { useEffect, useRef, useState, useCallback } from 'react';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { TabCountBadge } from './values';
import { cn } from '~/admin/utils';
import { Tabs } from '~/admin/ui';

const EDGE = 4;

/**
 * Configuration tabs in one horizontally scrolling row: labels never wrap,
 * fading edges show there is more, and the active tab scrolls into view (SH-7).
 */
export function ConfigTabBar({
  tabs,
  activeTab,
  onTabChange,
  tabBadges,
  children,
}: t.ConfigTabBarProps) {
  const localize = useLocalize();
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const updateEdges = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const start = row.scrollLeft > EDGE;
    const end = row.scrollLeft + row.clientWidth < row.scrollWidth - EDGE;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(row);
    return () => observer.disconnect();
  }, [updateEdges]);

  /** Again once badges load (in a profile they widen the tabs before the active one). */
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!row || !active) return;
    const rowRect = row.getBoundingClientRect();
    const tabRect = active.getBoundingClientRect();
    if (tabRect.left < rowRect.left) {
      row.scrollLeft -= rowRect.left - tabRect.left + 16;
    } else if (tabRect.right > rowRect.right) {
      row.scrollLeft += tabRect.right - rowRect.right + 16;
    }
    updateEdges();
  }, [activeTab, tabs.length, tabBadges, updateEdges]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      ariaLabel={localize('com_admin_nav_configuration')}
    >
      <div
        ref={rowRef}
        onScroll={updateEdges}
        className={cn(
          'scrollbar-none overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden **:[[role=tab]]:shrink-0 **:[[role=tab]]:whitespace-nowrap **:[[role=tablist]]:w-max **:[[role=tablist]]:min-w-full **:[[role=tablist]]:flex-nowrap',
          edges.start && edges.end && 'admin-tab-fade-both',
          edges.start && !edges.end && 'admin-tab-fade-start',
          !edges.start && edges.end && 'admin-tab-fade-end',
        )}
      >
        <Tabs.TriggersList>
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.id} value={tab.id} aria-controls={undefined}>
              <span className="flex items-center gap-1.5">
                {localize(tab.labelKey)}
                <TabCountBadge badge={tabBadges?.[tab.id]} />
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.TriggersList>
      </div>
      {children}
    </Tabs>
  );
}
