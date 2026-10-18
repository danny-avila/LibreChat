import { useState } from 'react';
import type { BaseSystemCapability } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { CapabilityImplications, CAPABILITY_CATEGORIES } from '~/admin/constants';
import { DecorativeIcon } from '~/admin/components/shared';
import { useLocalize } from '~/admin/hooks';
import { Icon, Switch } from '~/admin/ui';
import { cn } from '~/admin/utils';

const ALL_COLLAPSED = new Set(CAPABILITY_CATEGORIES.map((c) => c.key));

function getImpliedSet(capabilities: Record<string, boolean>): Set<string> {
  const implied = new Set<string>();
  for (const [cap, enabled] of Object.entries(capabilities)) {
    if (enabled) {
      for (const impliedCap of CapabilityImplications[cap as BaseSystemCapability] ?? []) {
        implied.add(impliedCap);
      }
    }
  }
  return implied;
}

export function CapabilityPanel({ capabilities, onChange, disabled }: t.CapabilityPanelProps) {
  const localize = useLocalize();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(ALL_COLLAPSED));
  const impliedSet = getImpliedSet(capabilities);

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggle = (cap: string, value: boolean) => {
    const updated = { ...capabilities, [cap]: value };
    if (!value) {
      for (const impliedCap of CapabilityImplications[cap as BaseSystemCapability] ?? []) {
        const stillImplied = Object.entries(updated).some(
          ([k, v]) =>
            v &&
            k !== cap &&
            (CapabilityImplications[k as BaseSystemCapability] ?? []).includes(impliedCap),
        );
        if (!stillImplied) updated[impliedCap] = false;
      }
    }
    onChange(updated);
  };

  const handleToggleAll = (categoryKey: string, value: boolean) => {
    const category = CAPABILITY_CATEGORIES.find((c) => c.key === categoryKey);
    if (!category) return;
    const updated = { ...capabilities };
    for (const cap of category.capabilities) {
      updated[cap] = value;
    }
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-2">
      {CAPABILITY_CATEGORIES.map((category) => {
        const caps = category.capabilities;
        const enabledCount = caps.filter(
          (c: string) => capabilities[c] || impliedSet.has(c),
        ).length;
        const allEnabled = enabledCount === caps.length;
        const isOpen = !collapsed.has(category.key);

        return (
          <div key={category.key} className="rounded-lg border border-(--cui-color-stroke-default)">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggleCollapsed(category.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleCollapsed(category.key);
                }
              }}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-(--cui-color-background-hover) focus-visible:bg-(--cui-color-background-hover) focus-visible:outline-1 focus-visible:outline-(--cui-color-outline)',
                isOpen ? 'rounded-t-lg' : 'rounded-lg',
              )}
            >
              <div className="flex flex-1 items-center gap-2">
                <DecorativeIcon
                  name="chevron-right"
                  size="sm"
                  className={cn(
                    'text-(--cui-color-text-muted) transition-transform',
                    isOpen && 'rotate-90',
                  )}
                />
                <span className="text-sm font-medium text-(--cui-color-text-default)">
                  {localize(category.labelKey)}
                </span>
              </div>
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-(--cui-color-text-muted)">
                  {allEnabled ? localize('com_admin_ui_all') : `${enabledCount}/${caps.length}`}
                </span>
                <Switch
                  id={`cap-all-${category.key}`}
                  checked={allEnabled}
                  onCheckedChange={(v) => handleToggleAll(category.key, v)}
                  disabled={disabled}
                  aria-label={`${localize(category.labelKey)}: ${localize('com_admin_ui_select_all')}`}
                />
              </div>
            </div>
            {isOpen && (
              <div className="border-t border-(--cui-color-stroke-default) px-4 py-2">
                <div className="flex flex-col gap-1 pl-6">
                  {caps.map((cap: string) => {
                    const isImplied = impliedSet.has(cap) && !capabilities[cap];
                    const isChecked = capabilities[cap] || isImplied;
                    const capLabel = localize(`com_admin_cap_${cap.replace(/:/g, '_')}`);
                    const switchId = `cap-${cap.replace(/:/g, '_')}`;

                    return (
                      <label
                        key={cap}
                        htmlFor={disabled || isImplied ? undefined : switchId}
                        className={cn(
                          'flex items-center justify-between py-1.5',
                          disabled || isImplied ? 'cursor-default' : 'cursor-pointer',
                        )}
                      >
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'text-sm',
                              isImplied
                                ? 'text-(--cui-color-text-disabled)'
                                : 'text-(--cui-color-text-muted)',
                            )}
                          >
                            {capLabel}
                          </span>
                          {isImplied && (
                            <span className="flex items-center gap-1 text-xs text-(--cui-color-text-link)">
                              <Icon name="information" size="xs" />
                              {localize('com_admin_cap_implied_by', {
                                cap: localize(
                                  `com_admin_cap_${
                                    Object.entries(capabilities)
                                      .find(
                                        ([k, v]) =>
                                          v &&
                                          (
                                            CapabilityImplications[k as BaseSystemCapability] ?? []
                                          ).includes(cap as BaseSystemCapability),
                                      )?.[0]
                                      ?.replace(/:/g, '_') ?? cap.replace(/:/g, '_')
                                  }`,
                                ),
                              })}
                            </span>
                          )}
                        </div>
                        <Switch
                          id={switchId}
                          checked={isChecked}
                          onCheckedChange={(v) => handleToggle(cap, v)}
                          disabled={disabled || isImplied}
                          aria-label={`${localize(category.labelKey)}: ${capLabel}`}
                          aria-disabled={isImplied || undefined}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
