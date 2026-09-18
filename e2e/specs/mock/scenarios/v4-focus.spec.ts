import { expect, test } from '@playwright/test';
import { computedStyles, normalizeColor, themeValue, useStoredTheme } from './style.helpers';
import type { Page } from '@playwright/test';

/**
 * Two of the upgrade's renamings are about focus, and both are invisible until
 * something else is on: the composer's controls halve their own focus ring with
 * v4's slash syntax, which bakes the alpha into `--tw-ring-color` where the high
 * contrast mode used to reset an opacity variable that no longer exists; and 283
 * `outline-none` classes became `outline-hidden`, because v3's `outline-none`
 * emitted a transparent 2px outline — the thing that keeps a focus indicator
 * when the platform forces its own colours — while v4's means `outline: none`.
 */

/** The attach-file menu trigger: one Tab from the composer on the new-chat
 *  screen with no seeding, and it carries both classes under test
 *  (`focus-visible:ring-text-primary/50` and `focus-visible:outline-hidden`,
 *  client/src/components/Chat/Input/Files/AttachFileMenu.tsx). */
const ATTACH_TRIGGER = '#attach-file-menu-button';

/** Focus it by keyboard, because both classes are behind `focus-visible:`. */
async function tabToAttachTrigger(page: Page): Promise<void> {
  const composer = page.getByRole('textbox', { name: 'Message input' });
  await expect(composer).toBeVisible({ timeout: 30000 });
  await composer.click();
  for (let press = 0; press < 15; press++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      (selector) => document.activeElement?.matches(selector) ?? false,
      ATTACH_TRIGGER,
    );
    if (focused) return;
  }
  throw new Error('the attach-file trigger was never reached by Tab');
}

test.describe('Tailwind v4 focus treatment', () => {
  /** The composer's action row is laid out differently below `md`, where the
   *  attach trigger is not one Tab from the textarea; the focus treatment under
   *  test is the same class, so the scenario declares a desktop viewport. */
  test.use({ viewport: { width: 1280, height: 900 } });

  test('high contrast keeps a halved focus ring opaque @scenario:high-contrast-keeps-a-halved-focus-ring-opaque', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto('/c/new', { timeout: 30000 });
    await tabToAttachTrigger(page);

    /** Without the mode, the control's own halved ring is what shows. */
    const halved = await computedStyles(page.locator(ATTACH_TRIGGER), ['--tw-ring-color']);
    expect(halved['--tw-ring-color']).toContain('color-mix');

    await page.emulateMedia({ contrast: 'more' });
    await expect(page.locator('html.high-contrast')).toHaveCount(1, { timeout: 30000 });
    await tabToAttachTrigger(page);

    /** With it, the ring is restored to the ink token at full strength: the
     *  stylesheet re-declares the colour, because v4 has no ring-opacity. */
    const restored = await computedStyles(page.locator(ATTACH_TRIGGER), ['--tw-ring-color']);
    const opaque = await normalizeColor(page, `rgb(${await themeValue(page, '--text-primary')})`);
    expect(await normalizeColor(page, restored['--tw-ring-color'])).toBe(opaque);
    expect(restored['--tw-ring-color']).not.toContain('color-mix');

    /** The restoring rule is `html.high-contrast *`, so it has to hold for every
     *  control that halves its own ring rather than only the one focused above:
     *  the attach-file button, the composer's collapse and its tools menu all
     *  write the same class. */
    for (const selector of ['#attach-file', '#collapse-chat-button', '#tools-menu-button']) {
      const control = page.locator(selector);
      if ((await control.count()) === 0) continue;
      const ring = await computedStyles(control, ['--tw-ring-color']);
      expect(await normalizeColor(page, ring['--tw-ring-color']), selector).toBe(opaque);
    }

    await page.emulateMedia({ contrast: null });
  });

  test('a focused control keeps its ring in forced colors @scenario:a-focused-control-keeps-its-ring-in-forced-colors', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/c/new', { timeout: 30000 });
    await tabToAttachTrigger(page);

    /** `outline-hidden` keeps v3's transparent outline, which the platform
     *  repaints in forced colours; `outline-none` would remove the outline box
     *  and leave the keyboard user with the ring alone, which forced colours
     *  flattens. */
    const outline = await computedStyles(page.locator(ATTACH_TRIGGER), [
      'outlineStyle',
      'outlineWidth',
    ]);
    expect(outline.outlineStyle).not.toBe('none');
    expect(outline.outlineWidth).not.toBe('0px');

    await page.emulateMedia({ forcedColors: null });
  });
  test('a focused control shows only its focus ring @scenario:a-focused-control-shows-only-its-focus-ring', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await useStoredTheme(page, 'light');
    await page.goto('/c/new', { timeout: 30000 });
    await tabToAttachTrigger(page);

    const focused = await computedStyles(page.locator(ATTACH_TRIGGER), [
      'outlineStyle',
      'boxShadow',
    ]);
    expect(focused.outlineStyle).toBe('none');
    expect(focused.boxShadow).not.toBe('none');
  });
});
