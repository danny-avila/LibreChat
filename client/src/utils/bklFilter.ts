import type { TMessage } from 'librechat-data-provider';
import type { PeriodFilterState, PeriodFilterPreset, ExtensionGroup } from '~/store/filters';

const BKL_RID_RE = /<!-- bkl_rid:([a-zA-Z0-9_-]+) -->/;

/**
 * Pull the durable BKL `request_id` out of an assistant message.
 *
 * The backend embeds `<!-- bkl_rid:<id> -->` into the answer text, so the id
 * travels with the message through duplicate/fork/branch and share (which only
 * change `messageId`). This lets citation lookup prefer the stable request id
 * over the volatile `messageId`.
 */
export const extractBklRidFromMessage = (message?: TMessage | null): string | null => {
  if (!message) {
    return null;
  }

  const fromText = message.text?.match(BKL_RID_RE)?.[1];
  if (fromText) {
    return fromText;
  }

  if (!Array.isArray(message.content)) {
    return null;
  }

  for (const part of message.content) {
    if (part?.type !== 'text') {
      continue;
    }
    const raw = (part as Record<string, unknown>).text;
    const textValue = typeof raw === 'string' ? raw : (raw as { value?: string } | null)?.value;
    const fromContent = textValue?.match(BKL_RID_RE)?.[1];
    if (fromContent) {
      return fromContent;
    }
  }

  return null;
};

/** Register a message's BKL `request_id` so `BklCitation` can resolve sources. */
export const registerBklRid = (messageId: string, rid: string | null): void => {
  if (!messageId || !rid) {
    return;
  }
  const win = window as unknown as { __bklRids?: Record<string, string> };
  win.__bklRids = win.__bklRids ?? {};
  win.__bklRids[messageId] = rid;
};

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

export const buildBklFilterTag = (
  state: PeriodFilterState | null | undefined,
  matterUids?: string[] | null,
  docIds?: string[] | null,
  docLabels?: string[] | null,
): string => {
  const resolved = resolvePeriodFilter(state);
  const matterUidsStr = matterUids && matterUids.length > 0 ? matterUids.join(',') : '';
  const docIdsStr = docIds && docIds.length > 0 ? docIds.join(',') : '';
  const docLabelsStr = docLabels && docLabels.length > 0 ? docLabels.join(',') : '';
  const hasAny =
    resolved.date_from ||
    resolved.date_to ||
    (resolved.extension_groups && resolved.extension_groups.length > 0) ||
    matterUidsStr.length > 0 ||
    docIdsStr.length > 0;
  if (!hasAny) return '';
  const payload: Record<string, unknown> = { ...resolved };
  if (matterUidsStr) payload.matter_uids = matterUidsStr;
  if (docIdsStr) payload.doc_ids = docIdsStr;
  if (docLabelsStr) payload.doc_labels = docLabelsStr;
  return `[BKL_FILTER:${JSON.stringify(payload)}] `;
};

export const buildBklQueryEnhanceTag = (enabled: boolean | null | undefined): string =>
  enabled ? '[BKL_QUERY_ENHANCE:on]' : '';

export const buildBklReferenceTag = (matterUids?: string[] | null): string => {
  if (!matterUids || matterUids.length === 0) return '';
  const s = matterUids.join(',');
  if (!s) return '';
  return `[BKL_REFERENCE:${JSON.stringify({ matter_uids: s })}] `;
};

const BKL_TAG_RE =
  /^(?:\[BKL_FILTER:\{.*?\}\]|\[BKL_REFERENCE:\{.*?\}\]|\[BKL_GUIDED_RETRY:[A-Za-z0-9_-]+\]|\[BKL_QUERY_ENHANCE:on\]|\[BKL_QUERY_CHOICES:[A-Za-z0-9+/=]+\])\s*/;
const BKL_QUERY_CHOICES_COMPLETE_RE = /^\[BKL_QUERY_CHOICES:[A-Za-z0-9+/=]+\]\s*$/;
const BKL_QUERY_CHOICES_PARTIAL_RE = /^\[BKL_QUERY_CHOICES:[A-Za-z0-9+/=]*$/;
export const BKL_QUERY_CHOICES_READY_TEXT =
  '쿼리 강화 후보를 준비했습니다. 아래 선택지에서 질문을 골라 주세요.';
export const BKL_QUERY_CHOICES_PENDING_TEXT = '쿼리 강화 후보를 준비 중입니다.';

export const stripBklTags = (text: string | null | undefined): string => {
  if (!text) return text ?? '';
  let out = text;
  if (BKL_QUERY_CHOICES_PARTIAL_RE.test(out)) {
    return '';
  }
  // Strip potentially multiple prefixed tags (filter may appear after guided retry or vice versa).
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(BKL_TAG_RE, '');
  }
  out = out.replace(/\[\/\/\]: # \(bkl_rid:[a-zA-Z0-9_-]+\)/g, '');
  return out;
};

export const getBklDisplayText = (text: string | null | undefined): string => {
  if (!text) return text ?? '';
  if (BKL_QUERY_CHOICES_COMPLETE_RE.test(text)) {
    return BKL_QUERY_CHOICES_READY_TEXT;
  }
  if (BKL_QUERY_CHOICES_PARTIAL_RE.test(text)) {
    return BKL_QUERY_CHOICES_PENDING_TEXT;
  }
  return stripBklTags(text);
};

export interface BklQueryCandidate {
  id: string;
  query: string;
  rationale: string;
}

export interface BklQueryChoicesPayload {
  candidates: BklQueryCandidate[];
  chunks_used: number;
  timings?: { retrieval_ms: number; llm_ms: number; total_ms: number };
}

const BKL_QUERY_CHOICES_RE = /^\[BKL_QUERY_CHOICES:([A-Za-z0-9+/=]+)\]/;

export const parseBklQueryChoices = (
  text: string | null | undefined,
): BklQueryChoicesPayload | null => {
  if (!text) return null;
  const m = text.match(BKL_QUERY_CHOICES_RE);
  if (!m) return null;
  try {
    const binary = atob(m[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder('utf-8').decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || !Array.isArray(obj.candidates)) return null;
    return obj as BklQueryChoicesPayload;
  } catch {
    return null;
  }
};
