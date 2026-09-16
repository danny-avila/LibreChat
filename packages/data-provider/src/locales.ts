/**
 * Locale codes accepted by `interface.defaultLanguage`.
 *
 * 🔴 Mirror of `client/src/locales/i18n.ts` (`supportedLocales` + `localeAliases`).
 * The i18n data lives in the client (with the translation loaders), but the
 * config schema in `config.ts` needs to validate `interface.defaultLanguage`
 * against it instead of accepting an arbitrary string. Keep this in sync when
 * a locale or alias is added there. `isSupportedLocale` reproduces the client's
 * `normalizeLocale` acceptance (canonical, alias, base tag, or `'auto'`).
 */
export const supportedLocales = [
  'ar', 'bo', 'bs', 'ca', 'cs', 'da', 'de', 'en', 'es', 'et', 'fa', 'fi', 'fr',
  'he', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'ko', 'lt', 'lv', 'nb', 'nl',
  'nn', 'pl', 'pt-BR', 'pt-PT', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'ug', 'uk',
  'vi', 'zh-Hans', 'zh-Hant',
] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const localeAliases: Record<string, string> = {
  'ar-eg': 'ar', 'ca-es': 'ca', 'cs-cz': 'cs', 'da-dk': 'da', 'de-de': 'de',
  'en-us': 'en', 'es-es': 'es', 'et-ee': 'et', 'fa-ir': 'fa', 'fi-fi': 'fi',
  'fr-fr': 'fr', 'he-he': 'he', 'he-il': 'he', 'hu-hu': 'hu', 'hy-am': 'hy',
  'id-id': 'id', 'it-it': 'it', 'ja-jp': 'ja', 'ka-ge': 'ka', 'ko-kr': 'ko',
  'lt-lt': 'lt', 'lv-lv': 'lv', 'nl-nl': 'nl', 'pl-pl': 'pl', 'pt': 'pt-PT',
  'ru-ru': 'ru', 'sv-se': 'sv', 'th-th': 'th', 'tr-tr': 'tr', 'uk-ua': 'uk',
  'vi-vn': 'vi', 'zh': 'zh-Hans', 'zh-cn': 'zh-Hans', 'zh-sg': 'zh-Hans',
  'zh-tw': 'zh-Hant', 'zh-hk': 'zh-Hant', 'zh-mo': 'zh-Hant',
};

const supportedByLowercase = new Set(supportedLocales.map((l) => l.toLowerCase()));

/**
 * A well-formed BCP-47 tag: a 2-3 letter language subtag followed by any number
 * of 2-8 alphanumeric subtags. The base-tag fallback in `isSupportedLocale` keys
 * only on the language subtag, so without this guard a malformed suffix such as
 * `de-@` or `de--DE` would pass validation on the strength of its supported base
 * and later crash `toLocaleDateString` with a `RangeError` on the share view.
 * Applied to the normalized (underscore- and case-folded) form, so `de_AT` is
 * still accepted while `de-@`, `de--DE` and `de-` are not.
 */
const wellFormedTag = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

/**
 * Whether `value` is a locale the UI can resolve: `'auto'`, a supported locale,
 * a known alias, or a well-formed tag whose base (`de-DE` -> `de`) is supported.
 * Matches the client's `normalizeLocale`, which never rejects but falls back to
 * `en`; here we use it to reject clearly-invalid configuration up front. The
 * base-tag fallback additionally requires a well-formed tag so a malformed
 * suffix cannot reach `Intl` downstream.
 */
export function isSupportedLocale(value: string): boolean {
  if (value === 'auto') {
    return true;
  }
  const normalized = value.replace(/_/g, '-').toLowerCase();
  if (supportedByLowercase.has(normalized) || normalized in localeAliases) {
    return true;
  }
  const base = normalized.split('-')[0];
  if (!(supportedByLowercase.has(base) || base in localeAliases)) {
    return false;
  }
  return wellFormedTag.test(normalized);
}
