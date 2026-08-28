/**
 * Sanitization policy for user-provided SVG icons, shared by the browser
 * uploader and the server trust boundary. The client sanitizes an icon before
 * encoding it as a data URI and the server re-sanitizes every stored value
 * (posting an `iconPath` straight to the API bypasses the browser entirely), so
 * both run DOMPurify with this one policy: a preview and the persisted icon
 * cannot disagree about what survives, and there is no second allowlist to keep
 * in step with the first.
 */

/**
 * DOMPurify configuration for icon markup. The `svg`/`svgFilters` profiles
 * supply the element and attribute vocabulary, so it tracks DOMPurify's curated
 * lists instead of being restated here; `on*` handlers are dropped by default.
 * The forbidden tags remove active content, embedded HTML, navigation, external
 * raster references, stylesheets, and animation. The SVG profile admits the whole
 * SMIL family, so each animation element is named rather than just `<animate>`;
 * otherwise a stored icon could loop forever in every menu, card, and tool call
 * that renders it. `use` is added back for the self-contained `<defs>` references
 * exporters emit, with its target restricted to the same document by
 * `restrictSvgReferences`, and `fr` for the radial-gradient focal radius the
 * profile omits.
 */
export const SVG_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  ADD_ATTR: ['fr'],
  FORBID_TAGS: [
    'script',
    'foreignObject',
    'style',
    'a',
    'image',
    'animate',
    'animateColor',
    'animateMotion',
    'animateTransform',
    'mpath',
    'set',
  ],
  FORBID_ATTR: ['style'],
};

/**
 * The element surface `restrictSvgReferences` needs, so the policy is shared by
 * the browser DOM and the server's jsdom without either importing the other.
 */
export interface SvgAttributeHost {
  attributes: ArrayLike<{ name: string }>;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
}

/** Matches the opening of a `url()` token, up to the first character of its
 *  target and past any quote. */
const URL_TOKEN_PREFIX = /url\(\s*['"]?\s*/gi;

/**
 * True when an attribute value carries no reference that leaves the document.
 * Presentation attributes hold CSS value lists, so `filter`, `mask`, and paint
 * fallbacks can name several targets; testing only the first would admit
 * `url(#safe) url(https://evil.example/f.svg#f)` with its external fetch intact,
 * so every token is checked. A backslash rejects the value outright: CSS
 * unescapes idents before tokenizing, so `u\72l(...)` is a `url()` this scan
 * would never otherwise see, and no legitimate icon geometry or paint value
 * contains one.
 */
function referencesOnlyFragments(value: string): boolean {
  if (value.includes('\\')) {
    return false;
  }
  if (!value.toLowerCase().includes('url(')) {
    return true;
  }
  URL_TOKEN_PREFIX.lastIndex = 0;
  let match: RegExpExecArray | null = URL_TOKEN_PREFIX.exec(value);
  while (match !== null) {
    if (value[URL_TOKEN_PREFIX.lastIndex] !== '#') {
      return false;
    }
    match = URL_TOKEN_PREFIX.exec(value);
  }
  return true;
}

/**
 * DOMPurify hook that drops every reference leaving the document: `href` and
 * `xlink:href` values that are not fragments, and any attribute whose value
 * fails `referencesOnlyFragments`. Restricting the URL shape rather than naming
 * the properties covers `fill`, `stroke`, `filter`, `mask`, `clip-path`, and
 * `marker-*` alike, so a new paint property cannot arrive unguarded.
 */
export function restrictSvgReferences(node: SvgAttributeHost): void {
  const names: string[] = [];
  for (let i = 0; i < node.attributes.length; i += 1) {
    names.push(node.attributes[i].name);
  }
  for (const name of names) {
    const value = node.getAttribute(name)?.trim();
    if (value == null) {
      continue;
    }
    if (name === 'href' || name === 'xlink:href') {
      if (!value.startsWith('#')) {
        node.removeAttribute(name);
      }
      continue;
    }
    if (!referencesOnlyFragments(value)) {
      node.removeAttribute(name);
    }
  }
}

/**
 * SVG elements the HTML tag-name adjustment table does not restore, paired with
 * their canonical spelling. `feDropShadow` postdates that table, so it is the
 * only one; `textPath`, `linearGradient`, `clipPath`, and the other filter
 * primitives are adjusted back by the parser.
 */
const UNADJUSTED_SVG_TAGS: Array<[RegExp, string]> = [[/(<\/?)fedropshadow\b/gi, '$1feDropShadow']];

/**
 * Restores camelCase element names the HTML parser lowercased. DOMPurify must
 * parse as HTML (its XML mode drops filter primitives, gradients, and
 * `textPath`), but the result is stored as `image/svg+xml` and re-parsed with
 * case-sensitive XML rules, where a lowercased primitive leaves its `<filter>`
 * empty and an element referencing an empty filter stops rendering.
 */
export function restoreSvgTagCase(markup: string): string {
  let restored = markup;
  for (const [pattern, canonical] of UNADJUSTED_SVG_TAGS) {
    restored = restored.replace(pattern, canonical);
  }
  return restored;
}
