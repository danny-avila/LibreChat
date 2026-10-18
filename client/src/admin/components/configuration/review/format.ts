import yaml from 'js-yaml';
import type * as t from '~/admin/types';
import { isConfigRecord, isEnvReference, maskSecretValues } from '~/admin/utils';
import { isConfigValueEqual } from '../edits';
import { identityKeyFor } from './diff';

const numberFormat = new Intl.NumberFormat();

/**
 * A value as review text: "(empty)", On/Off, grouped numbers, an enum
 * option's label (`labels`), inline YAML for objects; secrets masked. A
 * string of only whitespace (a `\n` stop sequence) is shown quoted and escaped.
 */
export function formatReviewValue(
  value: t.ConfigValue,
  localize: t.LocalizeFn,
  labels?: Readonly<Record<string, string>>,
): string {
  if (value === undefined || value === null) return localize('com_admin_config_field_not_set');
  const label =
    labels && !isConfigRecord(value) && !Array.isArray(value) ? labels[String(value)] : undefined;
  if (label) return label;
  if (value === '' || (Array.isArray(value) && value.length === 0)) {
    return localize('com_admin_config_review_empty');
  }
  if (typeof value === 'boolean') {
    return localize(value ? 'com_admin_config_review_on' : 'com_admin_config_review_off');
  }
  if (typeof value === 'number') return numberFormat.format(value);
  if (typeof value === 'string') return value.trim() === '' ? JSON.stringify(value) : value;
  if (
    Array.isArray(value) &&
    value.every((item) => !isConfigRecord(item) && !Array.isArray(item))
  ) {
    return value.map((item) => formatReviewValue(item, localize)).join(', ');
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isConfigRecord)) {
    const key = identityKeyFor('', value);
    if (key) {
      return localize('com_admin_config_review_entries', {
        count: value.length,
        names: value.map((entry) => String(entry[key])).join(', '),
      });
    }
  }
  return yaml.dump(maskSecretValues(value), { flowLevel: 0, lineWidth: -1 }).trim();
}

/** Whether a secret's value may be shown: only environment references such as `${API_KEY}`. */
export function isShowableSecret(value: t.ConfigValue): boolean {
  return value == null || isEnvReference(value);
}

/** Items added to and removed from a plain list, and whether only the order changed. */
export function diffList(
  before: t.ConfigValue,
  after: t.ConfigValue,
): { added: t.ConfigValue[]; removed: t.ConfigValue[]; reordered: boolean } {
  const beforeList = Array.isArray(before) ? before : [];
  const afterList = Array.isArray(after) ? after : [];
  const added = afterList.filter((item) => !beforeList.some((b) => isConfigValueEqual(b, item)));
  const removed = beforeList.filter((item) => !afterList.some((a) => isConfigValueEqual(a, item)));
  const reordered =
    added.length === 0 &&
    removed.length === 0 &&
    !isConfigValueEqual(beforeList, afterList) &&
    beforeList.length === afterList.length;
  return { added, removed, reordered };
}

/** Whether a change reads best as a list of added/removed items. */
export function isListChange(item: t.ChangeSummaryItem): boolean {
  const list = (value: t.ConfigValue) => value == null || Array.isArray(value);
  const isPlain = (value: t.ConfigValue) =>
    !Array.isArray(value) || !value.some((entry) => isConfigRecord(entry) || Array.isArray(entry));
  return (
    item.kind !== 'reverted' &&
    (Array.isArray(item.before) || Array.isArray(item.after)) &&
    list(item.before) &&
    list(item.after) &&
    isPlain(item.before) &&
    isPlain(item.after)
  );
}
