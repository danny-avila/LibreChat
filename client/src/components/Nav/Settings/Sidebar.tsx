import * as Tabs from '@radix-ui/react-tabs';
import { Search } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { TABS } from './types';
import type { SettingsContextValue, SettingsTab } from './types';

interface SidebarProps {
  ctx: SettingsContextValue;
  query: string;
  onQueryChange: (q: string) => void;
  onSelectTab: (tab: SettingsTab) => void;
}

export default function Sidebar({ ctx, query, onQueryChange, onSelectTab }: SidebarProps) {
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
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={localize('com_ui_settings_search_placeholder')}
          aria-label={localize('com_ui_settings_search_placeholder')}
          className="w-full rounded-lg bg-surface-secondary py-2 pl-8 pr-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-xheavy"
        />
      </div>
      <Tabs.List
        aria-label={localize('com_nav_settings')}
        className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors',
              'radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
            )}
          >
            {tab.icon}
            <span className="whitespace-nowrap">{localize(tab.labelKey)}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </div>
  );
}
