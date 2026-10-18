/**
 * Field-level search over the configuration (WS5: SH-3). Every schema leaf,
 * group and section is indexed with its localized label, key, path and
 * breadcrumb, plus the dynamic entries in the current values (custom
 * endpoints, MCP servers, model specs, Azure groups, …) and their fields.
 * Matching is by word prefix; label matches outrank key and breadcrumb ones.
 */
import type * as t from '~/admin/types';
import {
  OTHER_TAB,
  CONFIG_TABS,
  SECTION_META,
  HIDDEN_SECTIONS,
  isPathInSection,
  fallbackSectionTitle,
} from './configMeta';
import { isEnvReference, getValueAtPath, isConfigRecord, maskSecretValues } from '~/admin/utils';
import { getFieldMeta, labelForPath, describeField } from './meta';
import { inferTransportType } from './sections/mcp/validation';
import { isMcpFieldShown } from './sections/mcpFieldMeta';
import { getEntryTitle } from './fields/entries';
import { formatFieldValue } from './controls';

const VALUE_MAX = 40;
const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

const WEIGHTS = {
  label: { exact: 5, prefix: 4 },
  key: { exact: 3, prefix: 2.5 },
  context: { exact: 1.5, prefix: 1 },
} as const;

interface Placement {
  sectionId: string;
  tab: string;
  title: string;
  descriptionKey?: string;
}

interface WalkContext {
  localize: t.LocalizeFn;
  values: t.ConfigSearchValues;
  items: t.ConfigSearchItem[];
  placement: Placement;
}

/** camelCase and acronym boundaries: `startBalance` → `start Balance`, `OpenAI` → `Open AI`. */
function splitCase(word: string): string {
  return word
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
}

/**
 * Lower-cased words of a label, key or path, split on punctuation and dots,
 * with each camelCase word kept whole and split (`OpenAI` → `openai open ai`).
 */
export function tokenize(text: string): string[] {
  const words = text.split(WORD_SPLIT).filter(Boolean);
  const tokens: string[] = [];
  for (const word of words) {
    const parts = splitCase(word).toLowerCase().split(' ');
    if (parts.length > 1) tokens.push(word.toLowerCase());
    tokens.push(...parts);
  }
  return tokens;
}

function unique(words: string[]): string[] {
  return Array.from(new Set(words));
}

/**
 * Short, secret-safe display of a value for search results; with its field,
 * the labels the page uses (option labels such as "Hours", numbers with
 * their unit) instead of raw ids.
 */
export function formatSearchValue(
  value: t.ConfigValue,
  key: string,
  localize: t.LocalizeFn,
  field?: t.SchemaField,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') {
    return localize(value ? 'com_admin_config_shell_value_on' : 'com_admin_config_shell_value_off');
  }
  if (Array.isArray(value)) {
    return localize('com_admin_config_shell_value_items', { count: value.length });
  }
  if (typeof value === 'object') return undefined;
  const isSecret =
    typeof value === 'string' && !isEnvReference(value) && maskSecretValues(value, key) !== value;
  const labelled = field && !isSecret ? formatFieldValue(field, value, localize) : null;
  if (labelled != null && labelled !== String(value)) return truncate(labelled);
  if (typeof value === 'number') return NUMBER_FORMAT.format(value);
  return truncate(String(isEnvReference(value) ? value : maskSecretValues(value, key)));
}

function truncate(text: string): string {
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX - 1)}…` : text;
}

/** Where a top-level schema section is shown: its tab section(s), or the Other tab. */
function sectionPlacements(key: string, localize: t.LocalizeFn): Placement[] {
  const placements: Placement[] = [];
  for (const [sectionId, meta] of Object.entries(SECTION_META)) {
    const owns = meta.schemaKey ? meta.schemaKey === key : sectionId === key;
    if (!owns) continue;
    placements.push({
      sectionId,
      tab: meta.tab,
      title: localize(meta.pathPrefix ? labelOfTab(meta.tab) : meta.titleKey),
      descriptionKey: meta.descriptionKey,
    });
  }
  if (placements.length > 0) return placements;
  return [{ sectionId: key, tab: OTHER_TAB.id, title: fallbackSectionTitle(key) }];
}

function labelOfTab(tabId: string): string {
  return [...CONFIG_TABS, OTHER_TAB].find((tab) => tab.id === tabId)?.labelKey ?? tabId;
}

function isEntryCollection(field: t.SchemaField): boolean {
  if (!field.children?.length) return false;
  if (field.isArray) return true;
  return field.type === 'record' && field.recordValueType === 'complex';
}

function isGroup(field: t.SchemaField): boolean {
  return !!field.children?.length && !field.isArray && field.type !== 'record';
}

/** Breadcrumb without consecutive repeats ("Custom endpoints › Custom endpoints"). */
function crumbs(parts: string[]): string[] {
  return parts.filter((part, i) => part && part !== parts[i - 1]);
}

function pushItem(
  ctx: WalkContext,
  item: Omit<t.ConfigSearchItem, 'id' | 'tab' | 'sectionId' | 'terms'>,
  keyWords: string[],
  description?: string,
) {
  const { placement } = ctx;
  ctx.items.push({
    ...item,
    id: `${placement.tab}:${item.path}`,
    tab: placement.tab,
    sectionId: placement.sectionId,
    terms: {
      label: unique(tokenize(item.label)),
      key: unique(keyWords.flatMap((word) => [...tokenize(word), word.toLowerCase()])),
      context: unique([...item.breadcrumb, description ?? ''].flatMap(tokenize)),
    },
  });
}

/** Help text of a setting (WS2): the data path's meta description, else `describeField`. */
function fieldDescription(path: string, field: t.SchemaField, localize: t.LocalizeFn) {
  const key = getFieldMeta(path)?.descriptionKey;
  return key && !field.description ? localize(key) : describeField(field, localize);
}

/** Entries of a collection field in the current values: index or record key, and title. */
function collectionEntries(
  field: t.SchemaField,
  value: t.ConfigValue,
  localize: t.LocalizeFn,
): Array<{ segment: string; title: string }> {
  if (field.isArray) {
    if (!Array.isArray(value)) return [];
    return value.map((entry, index) => ({
      segment: String(index),
      title: getEntryTitle(entry, index, localize),
    }));
  }
  if (!isConfigRecord(value)) return [];
  return Object.keys(value).map((key) => ({ segment: key, title: key }));
}

function walkChildren(
  ctx: WalkContext,
  fields: t.SchemaField[],
  parentPath: string,
  breadcrumb: string[],
) {
  for (const child of fields) {
    const path = `${parentPath}.${child.key}`;
    if (!isPathInSection(ctx.placement.sectionId, rootKey(path), path)) continue;
    walkField(ctx, child, path, breadcrumb);
  }
}

function rootKey(path: string): string {
  const dot = path.indexOf('.');
  return dot === -1 ? path : path.slice(0, dot);
}

function walkField(ctx: WalkContext, field: t.SchemaField, path: string, breadcrumb: string[]) {
  const { localize, values } = ctx;
  const label = labelForPath(path, localize);
  const description = fieldDescription(path, field, localize);

  if (isEntryCollection(field)) {
    const isSectionList = SECTION_META[ctx.placement.sectionId]?.pathPrefix === path;
    if (!isSectionList) {
      pushItem(ctx, { label, breadcrumb, path, kind: 'field' }, [field.key, path], description);
    }
    const entryCrumbs = isSectionList ? breadcrumb : crumbs([...breadcrumb, label]);
    for (const { segment, title } of collectionEntries(
      field,
      getValueAtPath(values ?? null, path),
      localize,
    )) {
      const entryPath = `${path}.${segment}`;
      pushItem(ctx, { label: title, breadcrumb: entryCrumbs, path: entryPath, kind: 'entry' }, [
        segment,
      ]);
      walkChildren(ctx, field.children ?? [], entryPath, crumbs([...entryCrumbs, title]));
    }
    return;
  }

  if (isGroup(field)) {
    pushItem(ctx, { label, breadcrumb, path, kind: 'field' }, [field.key, path], description);
    walkChildren(ctx, field.children ?? [], path, crumbs([...breadcrumb, label]));
    return;
  }

  const value = formatSearchValue(getValueAtPath(values ?? null, path), field.key, localize, field);
  pushItem(
    ctx,
    { label, breadcrumb, path, kind: 'field', ...(value !== undefined && { value }) },
    [field.key, path],
    description,
  );
}

/** Builds the search index for the schema tree and the current config values. */
export function buildConfigSearchIndex(
  tree: t.SchemaField[],
  values: t.ConfigSearchValues,
  localize: t.LocalizeFn,
): t.ConfigSearchItem[] {
  const items: t.ConfigSearchItem[] = [];
  for (const section of tree) {
    if (HIDDEN_SECTIONS.has(section.key)) continue;
    for (const placement of sectionPlacements(section.key, localize)) {
      const ctx: WalkContext = { localize, values, items, placement };
      const tabLabel = localize(labelOfTab(placement.tab));
      const description = placement.descriptionKey ? localize(placement.descriptionKey) : '';
      pushItem(
        ctx,
        { label: placement.title, breadcrumb: [tabLabel], path: section.key, kind: 'section' },
        [section.key],
        description,
      );
      const sectionCrumbs = crumbs([tabLabel, placement.title]);
      if (isEntryCollection(section) && section.type === 'record') {
        walkRecordSection(ctx, section, sectionCrumbs);
      } else if (section.children?.length && !section.isArray) {
        walkChildren(ctx, section.children, section.key, sectionCrumbs);
      }
    }
  }
  return items;
}

/** The fields an entry shows: an MCP server only those of its transport (no Command on an HTTP server). */
function entryFields(section: t.SchemaField, entry: t.ConfigValue): t.SchemaField[] {
  const fields = section.children ?? [];
  if (section.key !== 'mcpServers' || !isConfigRecord(entry)) return fields;
  const transport = inferTransportType(entry);
  return fields.filter((field) => isMcpFieldShown(field.key, transport));
}

/** A top-level record section (MCP servers): its entries are the record keys. */
function walkRecordSection(ctx: WalkContext, section: t.SchemaField, breadcrumb: string[]) {
  const { localize, values } = ctx;
  const record = getValueAtPath(values ?? null, section.key);
  for (const { segment, title } of collectionEntries(section, record, localize)) {
    const entryPath = `${section.key}.${segment}`;
    const entry = isConfigRecord(record) ? record[segment] : undefined;
    pushItem(ctx, { label: title, breadcrumb, path: entryPath, kind: 'entry' }, [segment]);
    walkChildren(ctx, entryFields(section, entry), entryPath, crumbs([...breadcrumb, title]));
  }
}

function wordScore(word: string, terms: string[], weight: { exact: number; prefix: number }) {
  let best = 0;
  for (const term of terms) {
    if (term === word) return weight.exact;
    if (best === 0 && term.startsWith(word)) best = weight.prefix;
  }
  return best;
}

/** Scores one item against the query words; 0 when any word matches nothing. */
export function scoreSearchItem(item: t.ConfigSearchItem, words: string[], query: string): number {
  let score = 0;
  for (const word of words) {
    const best = Math.max(
      wordScore(word, item.terms.label, WEIGHTS.label),
      wordScore(word, item.terms.key, WEIGHTS.key),
      wordScore(word, item.terms.context, WEIGHTS.context),
    );
    if (best === 0) return 0;
    score += best;
  }
  const label = item.label.toLowerCase();
  if (label === query) score += 12;
  else if (label.startsWith(query)) score += 6;
  return score;
}

/** Whether every word of `query` is a prefix of a word of `texts` (static command items). */
export function matchesQuery(texts: string[], query: string): boolean {
  const words = unique(tokenize(query));
  if (words.length === 0) return true;
  const terms = texts.flatMap(tokenize);
  return words.every((word) => terms.some((term) => term.startsWith(word)));
}

/** What a match on the tab the admin is on is worth over an equal one elsewhere. */
const CURRENT_TAB_BOOST = 3;

/**
 * What a field inside a collection entry (an MCP server's Title, an
 * endpoint's Base URL) gives up against a top-level setting when searched
 * from another tab: the same label repeats once per entry, so the settings
 * that apply everywhere come first.
 */
const ENTRY_FIELD_PENALTY = 7;

const ENTRY_FIELD_RE = /\.\d+\.|^mcpServers\.[^.]+\./;

function rankOf(item: t.ConfigSearchItem, score: number, currentTab?: string): number {
  if (item.tab === currentTab) return score + CURRENT_TAB_BOOST;
  const inEntry = item.kind === 'field' && ENTRY_FIELD_RE.test(item.path);
  return inEntry ? score - ENTRY_FIELD_PENALTY : score;
}

/**
 * The best matches for `query`, highest score first, then shallower, then by
 * label. Matches on `currentTab` (the configuration tab open) rank higher,
 * and fields inside collection entries lower.
 */
export function searchConfigIndex(
  items: t.ConfigSearchItem[],
  query: string,
  limit = 50,
  currentTab?: string,
): t.ConfigSearchHit[] {
  const normalized = query.trim().toLowerCase();
  const words = unique(tokenize(normalized));
  if (words.length === 0) return [];
  const hits: t.ConfigSearchHit[] = [];
  for (const item of items) {
    const score = scoreSearchItem(item, words, normalized);
    if (score > 0) hits.push({ item, score: rankOf(item, score, currentTab) });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.breadcrumb.length - b.item.breadcrumb.length ||
      a.item.label.localeCompare(b.item.label),
  );
  return hits.slice(0, limit);
}
