import { useMemo } from 'react';
import type * as t from '~/admin/types';
import {
  getEntryKey,
  flattenObject,
  getValueAtPath,
  isConfigRecord,
  findEntryIndex,
  formatScopeName,
  maskSecretValues,
  getKeyedCollection,
  listScopeOverrideItems,
} from '~/admin/utils';
import { CONFIG_TABS, SECTION_META, splitCamelCase, tabForPath } from './configMeta';
import { findSchemaField, formatFieldValue } from './controls';
import { getConfigSection } from '~/admin/constants';
import { Badge, Button, Dialog } from '~/admin/ui';
import { useNavigate } from '~/admin/router';
import { fieldLabel } from './review/group';
import { useLocalize } from '~/admin/hooks';
import { sourceLabel } from './values';

/**
 * A value as the page shows it: units and option labels from its field,
 * secrets masked, a keyed list by its entries' names.
 */
function formatValue(
  value: t.ConfigValue | undefined,
  path: string,
  fields: t.SchemaField[] | undefined,
  localize: t.LocalizeFn,
): string | undefined {
  if (value === undefined) return undefined;
  const collection = getKeyedCollection(path);
  if (collection && Array.isArray(value)) {
    return value.flatMap((entry) => getEntryKey(entry, collection.key) ?? []).join(', ');
  }
  const masked = maskSecretValues(value, path.slice(path.lastIndexOf('.') + 1));
  const field = masked === value && fields ? findSchemaField(fields, path) : null;
  const shown = field ? formatFieldValue(field, value, localize) : null;
  if (shown != null) return shown;
  if (typeof masked === 'string') return masked;
  if (Array.isArray(masked) && masked.every((item) => item === null || typeof item !== 'object')) {
    return masked.map(String).join(', ');
  }
  return JSON.stringify(masked);
}

/** Where an entry of a keyed list renders on the page (`endpoints.custom.12`), by identity. */
function entryPathIn(
  config: t.ConfigRecord | null | undefined,
  collectionPath: string,
  identity: string,
): string | undefined {
  const collection = getKeyedCollection(collectionPath);
  if (!collection) return undefined;
  const list = getValueAtPath(config ?? null, collectionPath);
  const index = findEntryIndex(list, collection.key, identity);
  return index < 0 ? undefined : `${collectionPath}.${index}`;
}

/**
 * What the profile sets in one list entry, as "Field: value" pairs: each
 * stored value of the entry but its identity key ("Model display label:
 * Claude (USER)", "Models › Default: u1").
 */
function formatEntryValue(
  values: Record<string, t.ConfigValue> | null | undefined,
  item: t.ScopeOverrideItem,
  entryPath: string,
  fields: t.SchemaField[] | undefined,
  localize: t.LocalizeFn,
): string | undefined {
  const collection = getKeyedCollection(item.path);
  const list = values?.[item.path];
  if (!collection || item.entry === undefined || !Array.isArray(list)) return undefined;
  const stored = list[findEntryIndex(list, collection.key, item.entry)];
  if (!isConfigRecord(stored)) return undefined;
  const parts = Object.entries(flattenObject(stored)).flatMap(([leaf, value]) => {
    if (leaf === collection.key || value === undefined) return [];
    const path = `${entryPath}.${leaf}`;
    const label = fieldLabel(path, entryPath, localize, fields);
    return [`${label}: ${formatValue(value, path, fields, localize)}`];
  });
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** The group a row is listed under: a list's entries under its tab ("Custom endpoints"), else the section. */
function groupOf(item: t.ScopeOverrideItem): string {
  return item.entry !== undefined ? item.path : getConfigSection(item.path);
}

/**
 * "Overrides in this profile": every setting the open profile overrides or
 * hides, grouped by section, with its value, a link to the field and a way to
 * remove the override (WS8: PR-10). Removal marks the paths like the field's
 * own Reset, so it is reviewed and saved with the other edits.
 */
export function ScopeOverridesDialog({
  open,
  scope,
  values,
  pendingResets,
  onClose,
  onRevert,
  onUnhide,
  visibility,
  fields,
  config,
  onRevertEntry,
  isEntryPending,
}: t.ScopeOverridesDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();

  const sections = useMemo(() => {
    const bySection = new Map<string, t.ScopeOverrideItem[]>();
    for (const item of listScopeOverrideItems(scope)) {
      const section = groupOf(item);
      const list = bySection.get(section);
      if (list) list.push(item);
      else bySection.set(section, [item]);
    }
    return [...bySection.entries()];
  }, [scope]);

  const sectionTitle = (section: string) => {
    if (getKeyedCollection(section)) {
      const tab = CONFIG_TABS.find((entry) => entry.id === tabForPath(section));
      if (tab) return localize(tab.labelKey);
    }
    const meta = SECTION_META[section];
    return meta ? localize(meta.titleKey) : splitCamelCase(section).join(' ');
  };

  const isPending = (item: t.ScopeOverrideItem): boolean => {
    if (item.entry !== undefined) return isEntryPending?.(item.path, item.entry) ?? false;
    if (item.hidden) return visibility?.[item.path] === 'unhide';
    return item.paths.every((p) => pendingResets?.has(p));
  };

  const valueOf = (item: t.ScopeOverrideItem, entryPath: string | undefined) => {
    if (item.entry !== undefined) {
      return formatEntryValue(values, item, entryPath ?? item.path, fields, localize);
    }
    if (item.hidden) return undefined;
    if (values?.[item.path] !== undefined || item.paths.length === 0) {
      return formatValue(values?.[item.path], item.path, fields, localize);
    }
    /** An MCP server is one row for all the fields the profile sets in it ("Title: GitHub"). */
    const parts = item.paths.flatMap((path) => {
      const shown = formatValue(values?.[path], path, fields, localize);
      return shown === undefined
        ? []
        : [`${fieldLabel(path, item.path, localize, fields)}: ${shown}`];
    });
    return parts.length > 0 ? parts.join(' · ') : undefined;
  };

  const goTo = (path: string) => {
    onClose();
    navigate({
      to: '/configuration',
      search: (prev: t.ConfigSearchParams) => ({
        ...prev,
        tab: tabForPath(path),
        field: path,
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Content
        title={localize('com_admin_scope_overrides_title', {
          name: sourceLabel('scope', localize, { ...scope, name: formatScopeName(scope) }),
        })}
        showClose
        onClose={onClose}
      >
        {sections.length === 0 ? (
          <p className="text-sm text-(--cui-color-text-muted)">
            {localize('com_admin_scope_overrides_empty')}
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {onRevert && (
              <p className="text-xs text-(--cui-color-text-muted)">
                {localize('com_admin_scope_overrides_revert_hint')}
              </p>
            )}
            {sections.map(([section, items]) => (
              <section key={section} className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold tracking-wide text-(--cui-color-text-muted) uppercase">
                  {sectionTitle(section)}
                </h3>
                <ul className="flex flex-col">
                  {items.map((item) => {
                    const { entry } = item;
                    const entryPath =
                      entry !== undefined ? entryPathIn(config, item.path, entry) : undefined;
                    const pending = isPending(item);
                    const value = valueOf(item, entryPath);
                    const label = entry ?? fieldLabel(item.path, section, localize, fields);
                    const goToTarget = entry !== undefined ? (entryPath ?? item.path) : item.path;
                    const canRevert =
                      entry !== undefined ? onRevertEntry != null : onRevert != null;
                    const revert = () => {
                      if (entry !== undefined) onRevertEntry?.(item.path, entry);
                      else onRevert?.(item.paths);
                    };
                    return (
                      <li
                        key={`${item.hidden ? 'hidden' : 'set'}:${item.path}:${entry ?? ''}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--cui-color-stroke-default) py-2 last:border-b-0"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium text-(--cui-color-text-default)">
                              {label}
                            </span>
                            {item.hidden && (
                              <Badge
                                text={localize('com_admin_scope_overrides_hidden')}
                                state="neutral"
                                size="sm"
                              />
                            )}
                            {pending && (
                              <Badge
                                text={localize('com_admin_scope_overrides_pending')}
                                state="danger"
                                size="sm"
                              />
                            )}
                          </span>
                          {value !== undefined && (
                            <span className="text-xs wrap-break-word text-(--cui-color-text-default)">
                              {value}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Button
                            htmlType="button"
                            type="secondary"
                            label={localize('com_admin_scope_overrides_go')}
                            onClick={() => goTo(goToTarget)}
                          />
                          {onUnhide && item.hidden && (
                            <Button
                              htmlType="button"
                              type="secondary"
                              label={localize('com_admin_scope_overrides_unhide')}
                              disabled={pending}
                              onClick={() => onUnhide(item.path)}
                            />
                          )}
                          {canRevert && !item.hidden && (
                            <Button
                              htmlType="button"
                              type="secondary"
                              label={localize('com_admin_scope_overrides_revert')}
                              disabled={pending}
                              onClick={revert}
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Dialog.Content>
    </Dialog>
  );
}
