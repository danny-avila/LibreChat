import * as Tabs from '@radix-ui/react-tabs';
import { Search, X, ChevronRight } from 'lucide-react';
import type { SettingsContextValue, SettingsTab } from './types';
import { useLocalize } from '~/hooks';
import { TABS } from './types';
import { cn } from '~/utils';

interface SidebarProps {
  ctx: SettingsContextValue;
  query: string;
  onQueryChange: (q: string) => void;
  onSelectTab: (tab: SettingsTab) => void;
  showChevron?: boolean;
  hideTabs?: boolean;
}

export default function Sidebar({
  ctx,
  query,
  onQueryChange,
  onSelectTab,
  showChevron = false,
  hideTabs = false,
}: SidebarProps) {
  const localize = useLocalize();
  const tabs = TABS.filter((t) => !t.show || t.show(ctx));

  return (
    <div className="flex w-full flex-col gap-3 md:w-[230px]">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query.length > 0) {
              e.preventDefault();
              e.stopPropagation();
              onQueryChange('');
            }
          }}
          placeholder={localize('com_ui_settings_search_placeholder')}
          aria-label={localize('com_ui_settings_search_placeholder')}
          className="w-full rounded-lg bg-surface-secondary py-2 pl-8 pr-8 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label={localize('com_ui_clear_search')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {!hideTabs && (
        <Tabs.List
          aria-label={localize('com_nav_settings')}
          className="flex flex-col gap-1 overflow-visible"
        >
          {tabs.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover md:py-2',
                'radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
              )}
            >
              <span className="flex items-center gap-2">
                {tab.icon}
                <span className="whitespace-nowrap">{localize(tab.labelKey)}</span>
              </span>
              {showChevron && (
                <ChevronRight
                  className="h-4 w-4 flex-shrink-0 text-text-tertiary"
                  aria-hidden="true"
                />
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      )}
    </div>
  );
}
