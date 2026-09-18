import type { Locator } from '@playwright/test';

/**
 * Style probes for the scenarios that assert what the app paints. Both sides of
 * every comparison are resolved by the browser out of the stylesheet the app
 * shipped, never written down here: the same assertion then holds in light mode,
 * dark mode, under a custom theme, and across a Tailwind major.
 */

/**
 * Read several computed properties off a rendered element in one round trip.
 * Names are written the way the callers read them back (`touchAction`);
 * `getPropertyValue` only answers to the CSS spelling, so the hyphenation
 * happens here rather than at each call site — and a name it does not know
 * comes back empty, which fails the assertion instead of passing it.
 */
export function computedStyles<K extends string>(
  locator: Locator,
  properties: readonly K[],
): Promise<Record<K, string>> {
  return locator.evaluate((node, names: readonly string[]) => {
    const style = getComputedStyle(node as HTMLElement);
    const result: Record<string, string> = {};
    for (const name of names) {
      const property = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      result[name] = style.getPropertyValue(property).trim();
    }
    return result;
  }, properties) as Promise<Record<K, string>>;
}
