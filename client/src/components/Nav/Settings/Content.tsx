import { useMemo } from 'react';
import { useLocalize } from '~/hooks';
import { registry } from './registry';
import { filterSettings } from './search';
import { TABS, ADVANCED_LABEL_KEY, DANGER_LABEL_KEY } from './types';
import type { SettingsContextValue, SettingsTab, SettingEntry } from './types';
import Section from './Section';
import Advanced from './Advanced';

interface ContentProps {
  activeTab: SettingsTab;
  query: string;
  ctx: SettingsContextValue;
}

function visible(entry: SettingEntry, ctx: SettingsContextValue): boolean {
  return !entry.show || entry.show(ctx);
}

export default function Content({ activeTab, query, ctx }: ContentProps) {
  const localize = useLocalize();
  const tab = TABS.find((t) => t.id === activeTab)!;

  const results = useMemo(
    () => (query.trim() ? filterSettings(registry, query, ctx, localize) : null),
    [query, ctx, localize],
  );

  if (results !== null) {
    return (
      <div aria-label={localize('com_ui_settings_results_aria')} aria-live="polite">
        {results.length === 0 ? (
          <p className="p-2 text-sm text-text-secondary">
            {localize('com_ui_settings_no_results')}
          </p>
        ) : (
          results.map(({ entry, label }) => {
            const Cmp = entry.Component;
            const tabMeta = TABS.find((t) => t.id === entry.tab)!;
            const sectionMeta = tabMeta.sections.find((s) => s.id === entry.section);
            return (
              <div key={entry.id} className="mb-4">
                <div className="mb-1 text-xs text-text-tertiary">
                  {localize(tabMeta.labelKey)} ›{' '}
                  {sectionMeta ? localize(sectionMeta.labelKey) : label}
                </div>
                <Cmp />
              </div>
            );
          })
        )}
      </div>
    );
  }

  const tabEntries = registry.filter((e) => e.tab === activeTab && visible(e, ctx));
  const advanced = tabEntries.filter((e) => e.advanced);
  const danger = tab.sections.some((s) => s.danger);

  return (
    <div>
      {tab.sections.map((section) => {
        const entries = tabEntries.filter((e) => e.section === section.id && !e.advanced);
        if (entries.length === 0) {
          return null;
        }
        return (
          <Section key={section.id} heading={localize(section.labelKey)}>
            {entries.map((e) => {
              const Cmp = e.Component;
              return <Cmp key={e.id} />;
            })}
          </Section>
        );
      })}
      {advanced.length > 0 && (
        <Advanced
          label={localize(danger ? DANGER_LABEL_KEY : ADVANCED_LABEL_KEY)}
          count={advanced.length}
        >
          {advanced.map((e) => {
            const Cmp = e.Component;
            return <Cmp key={e.id} />;
          })}
        </Advanced>
      )}
    </div>
  );
}
