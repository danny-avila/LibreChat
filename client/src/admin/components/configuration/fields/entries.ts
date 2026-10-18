import type * as t from '~/admin/types';

const TITLE_KEYS = ['name', 'label', 'group', 'key', 'id'] as const;
const SUMMARY_KEYS = ['label', 'type', 'url', 'command', 'baseURL'] as const;

function asRecord(value: t.ConfigValue): t.ConfigRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** Identity of a collection entry (its name, label, group, key or id), or null. */
export function getEntryIdentity(item: t.ConfigValue): string | null {
  const record = asRecord(item);
  if (!record) return null;
  for (const key of TITLE_KEYS) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }
  return null;
}

/** LibreChat fills parameter labels with its client's locale keys (`com_admin_endpoint_prompt_cache`), which read as noise here. */
const FOREIGN_LOCALE_KEY_RE = /^com_[a-z0-9_]+$/;

function isReadableText(value: t.ConfigValue): value is string {
  return typeof value === 'string' && value !== '' && !FOREIGN_LOCALE_KEY_RE.test(value);
}

/**
 * Display title of an entry: its name, label, group, key or id (a LibreChat
 * locale key is skipped for the next one), else "Entry N" (1-based). Shared
 * with search, error and review rendering, so `list[0]` reads as the card's title.
 */
export function getEntryTitle(item: t.ConfigValue, index: number, localize: t.LocalizeFn): string {
  const record = asRecord(item);
  const title = record ? TITLE_KEYS.map((key) => record[key]).find(isReadableText) : undefined;
  return title ?? localize('com_admin_config_entry_n', { n: String(index + 1) });
}

/** One-line summary for a collapsed entry, without repeating its title. */
export function getEntrySummary(
  value: t.ConfigValue,
  title: string,
  labels: t.EntrySummaryLabels,
): string | null {
  if (typeof value === 'boolean') return value ? labels.enabled : labels.disabled;
  const record = asRecord(value);
  if (!record) return null;
  const parts: string[] = [];
  for (const key of SUMMARY_KEYS) {
    const part = record[key];
    if (!isReadableText(part) || part === title) continue;
    parts.push(key === 'type' && labels.type ? labels.type(part) : part);
  }
  const preset = asRecord(record.preset ?? null);
  if (preset && typeof preset.model === 'string') parts.push(preset.model);
  return parts.length > 0 ? parts.join(' · ') : null;
}
