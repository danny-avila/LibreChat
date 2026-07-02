import type { TBrandControl } from 'librechat-data-provider';

const BRAND_TOKEN_PATTERN = /\$\{(\w+)\}/g;

/** Runtime values substituted into brand field placeholders (`${token}` syntax).
 * Known tokens are typed; additional string-valued tokens are permitted so the
 * helper stays generic for controls added later (model_switcher, account_menu). */
export interface BrandTokenContext {
  modelName?: string;
  username?: string;
  email?: string;
  planName?: string;
  chatTitle?: string;
  modeId?: string;
  [token: string]: string | undefined;
}

/**
 * Substitute `${token}` placeholders in a brand field value using `context`.
 * Unknown or missing tokens are left intact (`${token}` remains) rather than
 * emptied — the safer default: it never silently corrupts surrounding literal
 * text or merges words, and makes an unresolved token visible instead of hidden.
 * `null`/`undefined` inputs pass through unchanged so callers can treat them as
 * "brand did not set this field".
 */
export function interpolateBrandField<T extends string | null | undefined>(
  value: T,
  context: BrandTokenContext = {},
): T {
  if (value == null) {
    return value;
  }
  return value.replace(BRAND_TOKEN_PATTERN, (match, token: string) => {
    const replacement = context[token];
    return replacement == null ? match : replacement;
  }) as T;
}

/**
 * Additive automation attributes for a response element (brand `response_container`
 * / `response_content`). Returns the non-class DOM handles: `testid` → `data-testid`,
 * `attr` → a presence attribute (e.g. `data-is-streaming`), and `tag` → `data-brand-tag`
 * (the real custom-element tag cannot be rendered additively without restructuring
 * shared message DOM). `classes` are appended alongside native classes at the call
 * site via `cn`. Returns `{}` when the brand/field is absent or the turn is not a
 * response, so non-branded output is byte-identical.
 */
export function brandResponseAttrs(
  control: TBrandControl | null,
  active: boolean,
): { [attr: string]: string | undefined } {
  if (!active || !control) {
    return {};
  }
  const attrs: { [attr: string]: string | undefined } = {};
  if (control.testid != null) {
    attrs['data-testid'] = control.testid;
  }
  if (control.tag != null) {
    attrs['data-brand-tag'] = control.tag;
  }
  if (control.attr != null) {
    attrs[control.attr] = '';
  }
  return attrs;
}
