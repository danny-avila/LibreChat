import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Helpers for the UI scale scenarios.
 *
 * The scale is one number in `localStorage.uiScale`, read by the pre-paint
 * bootstrap in `client/index.html` and by the `uiScaleAtom`, and applied as the
 * `--ui-scale` custom property that `style.css` feeds into the root font size.
 * Every assertion here therefore reads a *rendered* size, never the stored
 * value: the stored number proving nothing is the whole reason these scenarios
 * exist.
 */

/** Root font size with no scale applied and no browser font preference set. */
export const BASE_FONT_PX = 16;

/** The stops the stepper walks, mirroring the browser's own Ctrl -/+ ladder. */
export const SCALE_STOPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export const MAX_SCALE = 1.5;
export const MIN_SCALE = 0.5;

/** Seed the persisted preference before the app boots, the way a returning user arrives. */
export async function withStoredScale(page: Page, scale: number) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('uiScale', JSON.stringify(value));
  }, scale);
}

/** Collapse the sidebar before boot so the drawer/rail scenarios start from a known state. */
export async function withCollapsedSidebar(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('unifiedSidebarExpanded', 'false');
  });
}

export async function rootFontPx(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

/** The rendered root font size, polled: the stepper defers reflow past the click. */
export async function expectRootFontPx(page: Page, expected: number) {
  await expect
    .poll(() => rootFontPx(page), { message: `root font size should settle at ${expected}px` })
    .toBeCloseTo(expected, 1);
}

/**
 * Open Settings from the account menu. The trigger lives in the sidebar, which
 * is a drawer below the (scale-aware) drawer breakpoint, so open it when the
 * account button is not already on screen.
 */
export async function openSettings(page: Page) {
  const account = page.getByTestId('nav-user');
  if (!(await account.isVisible().catch(() => false))) {
    await page.getByTestId('open-sidebar-button').first().click();
  }
  await account.click();
  await page.getByTestId('nav-settings').click();
  await expect(closeSettingsButton(page)).toBeVisible();
}

/**
 * Open Settings and land on General > Appearance. Below the drawer breakpoint the
 * panel opens on its tab list and needs the tab picked; above it the tab is
 * already selected and clicking it is a no-op.
 */
export async function openAppearanceSettings(page: Page) {
  await openSettings(page);
  const general = page.getByRole('tab', { name: 'General', exact: true });
  if (await general.isVisible().catch(() => false)) {
    await general.click();
  }
  await expect(decreaseButton(page)).toBeVisible();
}

export const closeSettingsButton = (page: Page) =>
  page.getByRole('button', { name: 'Close Settings', exact: true });

export const decreaseButton = (page: Page) => page.getByTestId('ui-scale-decrease');
export const increaseButton = (page: Page) => page.getByTestId('ui-scale-increase');

/** The stepper's own readout, the number a person reads back after stepping. */
export const scaleReadout = (page: Page) =>
  page
    .locator('[aria-labelledby="ui-scale-selector-label"]')
    .locator('span[aria-live="polite"]')
    .first();

/** The Appearance card that holds the scale stepper and its sibling controls. */
export const appearanceCard = (page: Page) =>
  page.locator('section').filter({ has: page.getByTestId('ui-scale-decrease') });

declare global {
  interface Window {
    /** Root font sizes painted since `recordRootFontChanges`, in order. */
    __uiScaleSizes?: string[];
  }
}

/**
 * Record every *change* in the rendered root font size from now on. The stepper
 * promises a rapid burst of steps reflows once, which is only observable as the
 * sequence of sizes the page actually painted.
 */
export async function recordRootFontChanges(page: Page) {
  await page.evaluate(() => {
    const sizes: string[] = [];
    window.__uiScaleSizes = sizes;
    const tick = () => {
      const size = getComputedStyle(document.documentElement).fontSize;
      if (sizes[sizes.length - 1] !== size) {
        sizes.push(size);
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function recordedRootFontChanges(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__uiScaleSizes ?? []);
}

/** Horizontal overflow of the document, which a scaled layout must not introduce. */
export async function documentOverflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

/** Press a stepper button through the keyboard, which is faster than a click
 *  round-trip and keeps a burst of steps inside the coalescing window. */
export async function pressStepper(page: Page, button: 'increase' | 'decrease', times: number) {
  const target = button === 'increase' ? increaseButton(page) : decreaseButton(page);
  await target.focus();
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('Enter');
  }
}
