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
 * raster references, stylesheets, and animation. `use` is added back for the
 * self-contained `<defs>` references exporters emit, with its target restricted
 * to the same document by `restrictSvgReferences`.
 */
export const SVG_SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: ['use'],
  FORBID_TAGS: ['script', 'foreignObject', 'style', 'a', 'image', 'animate', 'set'],
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

/** Matches a same-document `url(#id)` reference, optionally quoted. */
const LOCAL_URL_REFERENCE = /^url\(\s*['"]?#/i;

/**
 * DOMPurify hook that drops every reference leaving the document: `href` and
 * `xlink:href` values that are not fragments, and any attribute carrying a
 * `url()` that is not `url(#id)`. Restricting the URL shape rather than naming
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
    if (value.toLowerCase().includes('url(') && !LOCAL_URL_REFERENCE.test(value)) {
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
