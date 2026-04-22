import type { PeriodFilterState, PeriodFilterPreset, ExtensionGroup } from '~/store/filters';

const toISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export interface ResolvedPeriodFilter {
  date_from?: string;
  date_to?: string;
  extension_groups?: ExtensionGroup[];
}

export const resolvePeriodFilter = (
  state: PeriodFilterState | null | undefined,
): ResolvedPeriodFilter => {
  if (!state) return {};
  const out: ResolvedPeriodFilter = {};

  const preset: PeriodFilterPreset = state.preset ?? 'all';
  if (preset === 'custom') {
    if (state.startDate) out.date_from = state.startDate;
    if (state.endDate) out.date_to = state.endDate;
  } else if (preset !== 'all') {
    const today = new Date();
    const from = new Date(today);
    switch (preset) {
      case 'last_3_months':
        from.setMonth(from.getMonth() - 3);
        break;
      case 'last_6_months':
        from.setMonth(from.getMonth() - 6);
        break;
      case 'last_1_year':
        from.setFullYear(from.getFullYear() - 1);
        break;
      case 'last_3_years':
        from.setFullYear(from.getFullYear() - 3);
        break;
      case 'last_5_years':
        from.setFullYear(from.getFullYear() - 5);
        break;
    }
    out.date_from = toISO(from);
    out.date_to = toISO(today);
  }

  if (state.extensionGroups && state.extensionGroups.length > 0) {
    out.extension_groups = [...state.extensionGroups];
  }

  return out;
};

/**
 * Build the `[BKL_FILTER:{...}] ` prefix to inject into the user query text.
 * Returns an empty string when no filter is active.
 */
export const buildBklFilterTag = (state: PeriodFilterState | null | undefined): string => {
  const resolved = resolvePeriodFilter(state);
  const hasAny =
    resolved.date_from ||
    resolved.date_to ||
    (resolved.extension_groups && resolved.extension_groups.length > 0);
  if (!hasAny) return '';
  return `[BKL_FILTER:${JSON.stringify(resolved)}] `;
};

// Strip leading BKL control tags (filter + guided retry) for display / history rendering.
const BKL_TAG_RE = /^(?:\[BKL_FILTER:[^\]]+\]|\[BKL_GUIDED_RETRY:[A-Za-z0-9_-]+\])\s*/;

export const stripBklTags = (text: string | null | undefined): string => {
  if (!text) return text ?? '';
  let out = text;
  // Strip potentially multiple prefixed tags (filter may appear after guided retry or vice versa).
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(BKL_TAG_RE, '');
  }
  return out;
};
