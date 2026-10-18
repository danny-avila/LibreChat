/**
 * Table-of-contents entries of a tab (WS5: SH-4): one per section and, under
 * it, its collection entries (custom endpoints, MCP servers, model specs,
 * providers) or its nested groups. Shared by the TOC and the "Jump to…" list.
 */
import type * as t from '~/admin/types';
import { isPathInSection, isPathUnder } from './configMeta';
import { isRowVisible } from '~/admin/utils';
import { orderFields } from './controls';
import { labelForPath } from './meta';

/** Nested groups, lists of objects and records of objects get their own TOC entry. */
function hasChildGroup(field: t.SchemaField): boolean {
  if (field.type === 'record') return field.recordValueType === 'complex';
  return !!field.children?.length;
}

/** Builds the entries for a tab's sections; with the tab filter, only the children holding a match. */
export function buildTocEntries(
  sections: t.ConfigSectionConfig[],
  localize: t.LocalizeFn,
  filter: t.PathIndex | null = null,
): t.TocEntry[] {
  return sections.map((section) => {
    const dataKey = section.schemaKey ?? section.id;
    const all: t.TocEntry[] = section.tocItems
      ? section.tocItems.map((item) => ({
          id: item.id,
          label: item.label,
          path: item.path ?? item.id.replace(/^section-/, ''),
          dataPath: item.dataPath ?? item.id.replace(/^section-/, ''),
          sectionId: section.id,
          children: [],
        }))
      : orderFields(section.fields, dataKey)
          .filter(hasChildGroup)
          .map((field) => {
            const path = `${dataKey}.${field.key}`;
            return {
              id: `section-${path}`,
              label: labelForPath(path, localize),
              path,
              dataPath: path,
              sectionId: section.id,
              children: [],
            };
          });
    const children = filter ? all.filter((child) => isRowVisible(filter, child.dataPath)) : all;
    return {
      id: `section-${section.id}`,
      label: section.title ?? localize(section.titleKey),
      path: section.id,
      dataPath: dataKey,
      sectionId: section.id,
      children,
    };
  });
}

/**
 * Whether any of `paths` lies in the entry, or (with `containing`) contains
 * it. Edited and error markers leave `containing` off, so one changed
 * endpoint marks that endpoint and its section, not every endpoint.
 */
export function entryHasPath(
  entry: t.TocEntry,
  paths: Iterable<string>,
  isSection: boolean,
  containing = true,
): boolean {
  for (const path of paths) {
    if (isSection) {
      if (isPathInSection(entry.sectionId, entry.dataPath, path)) return true;
    } else if (
      isPathUnder(path, entry.dataPath) ||
      (containing && isPathUnder(entry.dataPath, path))
    ) {
      return true;
    }
  }
  return false;
}

/** Flattens entries for the "Jump to…" select. */
export function toJumpTargets(entries: t.TocEntry[]): t.JumpTarget[] {
  return entries.flatMap((entry) => [
    { id: entry.id, label: entry.label },
    ...entry.children.map((child) => ({ id: child.id, label: child.label, child: true })),
  ]);
}

/** Finds an entry (section or child) by its DOM id. */
export function findTocEntry(entries: t.TocEntry[], id: string): t.TocEntry | undefined {
  for (const entry of entries) {
    if (entry.id === id) return entry;
    const child = entry.children.find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}
