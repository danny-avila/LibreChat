import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  flattenObject,
  getValueAtPath,
  isConfigRecord,
  findKeyedCollectionEntry,
} from '~/admin/utils';
import { CONFIG_TABS, OTHER_TAB, SECTION_META, splitCamelCase } from '../configMeta';
import { SKIP_REASON_KEYS, getConfigSection } from '~/admin/constants';
import { identityKeyFor, isSecretPath, findEntry } from './diff';
import { findSchemaField, getFieldOptions } from '../controls';
import { fieldVariants } from '../renderer/kinds';
import { labelForPath } from '../meta';

/** Locale keys for what an entry of a known collection is called. */
const NOUN_KEYS: Readonly<Record<string, string>> = {
  'endpoints.custom': 'com_admin_config_review_noun_endpoint',
  'modelSpecs.list': 'com_admin_config_review_noun_spec',
  mcpServers: 'com_admin_config_review_noun_mcp',
  'endpoints.azureOpenAI.groups': 'com_admin_config_review_noun_group',
};

const SCOPE_TYPE_KEYS: Readonly<Record<string, string>> = {
  [PrincipalType.ROLE]: 'com_admin_config_review_type_role',
  [PrincipalType.GROUP]: 'com_admin_config_review_type_group',
  [PrincipalType.USER]: 'com_admin_config_review_type_user',
};

const TABS = [...CONFIG_TABS, OTHER_TAB];
const TAB_ORDER = new Map(TABS.map((tab, i) => [tab.id, i]));
const INDEX_SEGMENT_RE = /^\d+$/;
const ENTRY_KINDS: ReadonlySet<t.ChangeKind> = new Set(['added', 'removed', 'renamed', 'reverted']);
const BREADCRUMB = ' › ';

/** Localized "Role" / "Group" / "User" for a principal type. */
export function principalTypeLabel(principalType: string, localize: t.LocalizeFn): string {
  const key = SCOPE_TYPE_KEYS[principalType];
  return key ? localize(key) : principalType;
}

/** Localized "Role" / "Group" / "User" for a profile. */
export function scopeTypeLabel(scope: t.ConfigScope, localize: t.LocalizeFn): string {
  return principalTypeLabel(scope.principalType, localize);
}

/** Tab and section a path is edited on, with their titles. */
export function locate(path: string, localize: t.LocalizeFn): t.ChangeLocation {
  const section = getConfigSection(path);
  if (section === 'endpoints') {
    const provider = path.split('.')[1];
    if (provider === 'custom' || provider == null) {
      const title = localize('com_admin_config_tab_custom_endpoints');
      return {
        tabId: 'custom',
        tabTitle: title,
        sectionKey: 'endpoints.custom',
        sectionTitle: title,
      };
    }
    return {
      tabId: 'providers',
      tabTitle: localize('com_admin_config_tab_ai_providers'),
      sectionKey: `endpoints.${provider}`,
      sectionTitle: labelForPath(`endpoints.${provider}`, localize),
    };
  }
  const meta = SECTION_META[section];
  const tab = TABS.find((candidate) => candidate.id === meta?.tab) ?? OTHER_TAB;
  return {
    tabId: tab.id,
    tabTitle: localize(tab.labelKey),
    sectionKey: section,
    sectionTitle: meta ? localize(meta.titleKey) : splitCamelCase(section).join(' '),
  };
}

/**
 * Breadcrumb of the named segments of `path` below `basePath` ("Terms of
 * service › Modal title"). With the schema, a key of a record (a header, a
 * parameter such as `max_tokens`) is shown as written, not as a field label.
 */
export function fieldLabel(
  path: string,
  basePath: string,
  localize: t.LocalizeFn,
  fields?: t.SchemaField[],
): string {
  if (path === basePath || !path.startsWith(`${basePath}.`)) return labelForPath(path, localize);
  const segments = path.slice(basePath.length + 1).split('.');
  const labels: string[] = [];
  let prefix = basePath;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const parent = prefix;
    prefix = `${prefix}.${segment}`;
    if (INDEX_SEGMENT_RE.test(segment)) continue;
    const record = fields != null ? findSchemaField(fields, parent) : null;
    if (record?.type !== 'record') {
      labels.push(labelForPath(prefix, localize));
      continue;
    }
    /** A key of a record of plain values is the rest of the path (`us.anthropic.claude-sonnet-4-6`). */
    if (!record.children?.length) {
      labels.push(segments.slice(i).join('.'));
      break;
    }
    labels.push(segment);
  }
  return labels.join(BREADCRUMB) || labelForPath(path, localize);
}

/** What an entry of a collection is called ("endpoint", "MCP server", "pattern"). */
export function collectionNoun(collectionPath: string, localize: t.LocalizeFn): string {
  const known = NOUN_KEYS[collectionPath.replace(/\.\d+(?=\.|$)/g, '')];
  if (known) return localize(known);
  const key = collectionPath.slice(collectionPath.lastIndexOf('.') + 1);
  const itemKey = `com_admin_config_field_${key}_item`;
  const noun = localize(itemKey);
  return noun === itemKey ? localize('com_admin_config_review_noun_entry') : noun;
}

function entryIndex(entryPath: string): number | undefined {
  const last = entryPath.slice(entryPath.lastIndexOf('.') + 1);
  return INDEX_SEGMENT_RE.test(last) ? Number(last) : undefined;
}

/** An entry's title: its identity (name), else its position ("Entry 3"). */
export function entryTitle(
  entry: Pick<t.ChangeSummaryItem, 'entryPath' | 'entryIdentity' | 'collectionPath'>,
  ctx: t.ReviewLabelContext,
): string {
  if (entry.entryIdentity) return entry.entryIdentity;
  if (!entry.entryPath) return '';
  const value = getValueAtPath(ctx.tree, entry.entryPath);
  const key = identityKeyFor(entry.collectionPath ?? '', [value]);
  const id = key && isConfigRecord(value) ? value[key] : undefined;
  if (typeof id === 'string' && id) return id;
  const index = entryIndex(entry.entryPath);
  return index == null
    ? entry.entryPath.slice(entry.entryPath.lastIndexOf('.') + 1)
    : ctx.localize('com_admin_config_entry_n', { n: String(index + 1) });
}

/**
 * Full label of a data path for issues and skipped changes:
 * "Custom endpoints › Moonshot › Base URL", entry indices replaced by titles.
 */
export function describePath(path: string, ctx: t.ReviewLabelContext, identity?: string): string {
  const location = locate(path, ctx.localize);
  const found = findEntry(ctx.fields, path, (entryPath) => getValueAtPath(ctx.tree, entryPath));
  const entry = found && identity ? { ...found, identity } : found;
  const parts = [location.tabTitle];
  if (location.sectionTitle !== location.tabTitle) parts.push(location.sectionTitle);
  if (entry) {
    parts.push(
      entryTitle(
        {
          entryPath: entry.entryPath,
          entryIdentity: entry.identity,
          collectionPath: entry.collectionPath,
        },
        ctx,
      ),
    );
    if (path !== entry.entryPath)
      parts.push(fieldLabel(path, entry.entryPath, ctx.localize, ctx.fields));
  } else if (path !== location.sectionKey) {
    parts.push(fieldLabel(path, location.sectionKey, ctx.localize, ctx.fields));
  }
  return parts.join(BREADCRUMB);
}

/** One line per skipped change ("Custom endpoints › Moonshot › Base URL: reason"), for toasts. */
export function describeSkippedChanges(
  skipped: t.SkippedChange[],
  ctx: t.ReviewLabelContext,
): string {
  return skipped
    .map((change) => `${describePath(change.fieldPath, ctx)}: ${skipReason(change, ctx)}`)
    .join('\n');
}

function skipReason(change: t.SkippedChange, ctx: t.ReviewLabelContext): string {
  return ctx.localize(SKIP_REASON_KEYS[change.reason]);
}

/** The labels of a variant field's branches when `path` is its discriminator (`summarization.trigger.type`). */
function discriminatorLabelsAt(
  path: string,
  ctx: t.ReviewLabelContext,
): Readonly<Record<string, string>> | undefined {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return undefined;
  const parent = findSchemaField(ctx.fields, path.slice(0, dot));
  if (!parent?.discriminator || parent.discriminator !== path.slice(dot + 1)) return undefined;
  const { variants } = fieldVariants(parent, ctx.localize);
  return Object.fromEntries(variants.map((variant) => [variant.key, variant.label ?? variant.key]));
}

/** Option labels of the enum setting at `path`, by value; undefined for other settings. */
function valueLabelsAt(
  path: string,
  ctx: t.ReviewLabelContext,
): Readonly<Record<string, string>> | undefined {
  const discriminated = discriminatorLabelsAt(path, ctx);
  if (discriminated) return discriminated;
  const field = findSchemaField(ctx.fields, path);
  if (!field || !field.type.startsWith('enum')) return undefined;
  const options = getFieldOptions(field, ctx.localize);
  return options.length > 0
    ? Object.fromEntries(options.map((option) => [option.value, option.label]))
    : undefined;
}

function isEntryLevel(item: t.ChangeSummaryItem): boolean {
  return item.entryPath === item.path && ENTRY_KINDS.has(item.kind);
}

/** Leaves of an added entry, listed under it (its identity is already the title). */
function addedDetails(item: t.ChangeSummaryItem, key: string, ctx: t.ReviewLabelContext) {
  if (!isConfigRecord(item.after) || !item.entryPath) return undefined;
  const entryPath = item.entryPath;
  /** A list entry's name is its title; a record entry (an MCP server) is titled by its key, so all its fields are listed. */
  const identityKey = INDEX_SEGMENT_RE.test(entryPath.slice(entryPath.lastIndexOf('.') + 1))
    ? identityKeyFor(item.collectionPath ?? '', [item.after])
    : undefined;
  return Object.entries(flattenObject(item.after))
    .filter(([leaf]) => leaf !== identityKey)
    .map(([leaf, value], i): t.ReviewRow => {
      const path = `${entryPath}.${leaf}`;
      return {
        key: `${key}:${i}`,
        label: fieldLabel(path, entryPath, ctx.localize, ctx.fields),
        item: {
          path,
          kind: 'added',
          before: undefined,
          after: value,
          secret: isSecretPath(path) || undefined,
        },
      };
    });
}

/**
 * The entry of a keyed list that a nested collection's change belongs to (a
 * parameter definition inside `endpoints.custom.3`), so the row is listed
 * under that entry's title, like the entry's own field changes.
 */
function outerEntryOf(
  item: t.ChangeSummaryItem,
): Pick<t.ChangeSummaryItem, 'entryPath' | 'collectionPath'> | undefined {
  const located = item.collectionPath ? findKeyedCollectionEntry(item.collectionPath) : undefined;
  if (!located?.rest) return undefined;
  return {
    entryPath: `${located.collection.path}.${located.index}`,
    collectionPath: located.collection.path,
  };
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

function rowPaths(row: t.ReviewRow): string[] {
  const { path, entryPath } = row.item;
  return isEntryLevel(row.item) && entryPath ? [entryPath] : [path];
}

/**
 * Groups summary items tab › section › entry with localized labels (WS7).
 * Entry-level changes (added, removed, renamed, reverted entries) are one row
 * each; field changes of an existing entry are grouped under its title. The
 * count is the number of rows: what Save writes, one change each.
 */
export function buildReviewModel(
  items: t.ChangeSummaryItem[],
  ctx: t.ReviewLabelContext,
  issues: t.ReviewIssue[] = [],
  skipped: t.SkippedChange[] = [],
): t.ChangeReviewModel {
  const tabs = new Map<string, { tab: t.ReviewTab; sections: Map<string, t.ReviewSection> }>();
  const entryGroups = new Map<string, t.ReviewEntryGroup>();
  const allRows: t.ReviewRow[] = [];

  /** The rows of an entry's group in a section, created under the entry's title on first use. */
  const groupRows = (
    section: t.ReviewSection,
    entry: Pick<t.ChangeSummaryItem, 'entryPath' | 'entryIdentity' | 'collectionPath'>,
  ): t.ReviewRow[] => {
    const entryPath = entry.entryPath ?? '';
    const groupKey = `${section.key}:${entryPath}`;
    let group = entryGroups.get(groupKey);
    if (!group) {
      group = {
        key: entryPath,
        title: entryTitle(entry, ctx),
        noun: collectionNoun(entry.collectionPath ?? '', ctx.localize),
        rows: [],
      };
      entryGroups.set(groupKey, group);
      section.entries.push(group);
    }
    return group.rows;
  };

  items.forEach((item, n) => {
    const location = locate(item.path, ctx.localize);
    let tab = tabs.get(location.tabId);
    if (!tab) {
      tab = {
        tab: { id: location.tabId, title: location.tabTitle, sections: [] },
        sections: new Map(),
      };
      tabs.set(location.tabId, tab);
    }
    let section = tab.sections.get(location.sectionKey);
    if (!section) {
      section = {
        key: location.sectionKey,
        title: location.sectionTitle,
        rows: [],
        entries: [],
        notices: [],
      };
      tab.sections.set(location.sectionKey, section);
      tab.tab.sections.push(section);
    }
    for (const warning of item.warnings ?? []) {
      if (warning === 'ownershipChange' && !section.notices.includes(warning)) {
        section.notices.push(warning);
      }
    }
    const key = `${n}:${item.kind}:${item.path}`;
    const outer = outerEntryOf(item);
    if (isEntryLevel(item)) {
      const row: t.ReviewRow = {
        key,
        item,
        label: entryTitle(item, ctx),
        noun: collectionNoun(item.collectionPath ?? '', ctx.localize),
        details: item.kind === 'added' ? addedDetails(item, key, ctx) : undefined,
      };
      (outer ? groupRows(section, outer) : section.rows).push(row);
      allRows.push(row);
      return;
    }
    if (item.entryPath) {
      const field = fieldLabel(item.path, item.entryPath, ctx.localize, ctx.fields);
      const row: t.ReviewRow = {
        key,
        item,
        label: outer ? `${entryTitle(item, ctx)}${BREADCRUMB}${field}` : field,
        valueLabels: valueLabelsAt(item.path, ctx),
      };
      groupRows(section, outer ?? item).push(row);
      allRows.push(row);
      return;
    }
    const row: t.ReviewRow = {
      key,
      item,
      label: fieldLabel(item.path, location.sectionKey, ctx.localize, ctx.fields),
      valueLabels: valueLabelsAt(item.path, ctx),
    };
    section.rows.push(row);
    allRows.push(row);
  });

  for (const issue of issues) {
    const { path } = issue;
    if (!path) continue;
    const row = allRows.find((candidate) => rowPaths(candidate).some((p) => overlaps(p, path)));
    if (row) row.issues = [...(row.issues ?? []), issue];
  }

  const orderedTabs = [...tabs.values()]
    .map(({ tab }) => tab)
    .sort((a, b) => (TAB_ORDER.get(a.id) ?? TABS.length) - (TAB_ORDER.get(b.id) ?? TABS.length));
  return {
    tabs: orderedTabs,
    count: allRows.length,
    tabTitles: orderedTabs.map((tab) => tab.title),
    changedPaths: items.map((item) =>
      item.kind === 'removed' && item.entryPath === item.path && item.collectionPath
        ? item.collectionPath
        : item.path,
    ),
    issues,
    skipped: skipped.map((change, i) => ({
      key: `${i}:${change.fieldPath}`,
      path: change.fieldPath,
      label: describePath(change.fieldPath, ctx),
      reason: skipReason(change, ctx),
    })),
  };
}
