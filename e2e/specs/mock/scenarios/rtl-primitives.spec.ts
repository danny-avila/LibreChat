import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { NEW_CHAT_PATH } from '../helpers';

/**
 * The shared primitives place their parts on logical sides, so the same markup lays out mirrored
 * under `dir="rtl"`. The document direction is set by hand after load: the language that flips it
 * belongs to the i18n layer, and what these scenarios hold is how the primitives follow it.
 */
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: { width: 1280, height: 800 } });

type Direction = 'ltr' | 'rtl';

async function setDirection(page: Page, dir: Direction) {
  await page.evaluate((value) => {
    document.documentElement.dir = value;
  }, dir);
}

async function openGeneralSettings(page: Page, dir: Direction): Promise<Locator> {
  await page.goto(NEW_CHAT_PATH, { timeout: 15000 });
  await setDirection(page, dir);
  await page.getByTestId('nav-user').click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await dialog.getByRole('tab', { name: 'General' }).click();
  return dialog;
}

/** Where the thumb sits inside its track once its transition settles, in track pixels. */
async function thumbOffsets(control: Locator) {
  let previous = '';
  await expect
    .poll(async () => {
      const next = JSON.stringify(await readThumb(control));
      const settled = next === previous;
      previous = next;
      return settled;
    })
    .toBe(true);
  return JSON.parse(previous) as Awaited<ReturnType<typeof readThumb>>;
}

function readThumb(control: Locator) {
  return control.evaluate((node: HTMLElement) => {
    const track = node.getBoundingClientRect();
    const thumb = (node.firstElementChild as HTMLElement).getBoundingClientRect();
    return {
      state: node.getAttribute('data-state'),
      fromLeft: Math.round(thumb.left - track.left),
      fromRight: Math.round(track.right - thumb.right),
    };
  });
}

/** Toggles the switch, reads both states, and leaves it as it was. */
async function bothStates(control: Locator) {
  const first = await thumbOffsets(control);
  await control.click();
  const second = await thumbOffsets(control);
  await control.click();
  await expect(control).toHaveAttribute('data-state', first.state ?? '');
  const checked = first.state === 'checked' ? first : second;
  const unchecked = first.state === 'checked' ? second : first;
  return { checked, unchecked };
}

async function openArchivedChats(page: Page, dir: Direction): Promise<Locator> {
  await page.goto(NEW_CHAT_PATH, { timeout: 15000 });
  await setDirection(page, dir);
  await page.getByTestId('nav-user').click();
  await page.getByRole('menuitem', { name: 'Archived chats' }).click();
  const dialog = page.getByRole('dialog', { name: 'Archived chats' });
  await expect(dialog.getByRole('heading', { name: 'Archived chats' })).toBeVisible({
    timeout: 15000,
  });
  return dialog;
}

async function archivedLayout(dialog: Locator) {
  return dialog.evaluate((node: HTMLElement) => {
    const box = node.getBoundingClientRect();
    const close = Array.from(node.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Close',
    ) as HTMLElement;
    const closeBox = close.getBoundingClientRect();
    const heading = node.querySelector('h2') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const text = range.getBoundingClientRect();
    return {
      closeCenter: (closeBox.left + closeBox.right) / 2 - box.left,
      dialogWidth: box.width,
      textOverlapsClose: text.right > closeBox.left && text.left < closeBox.right,
    };
  });
}

test.describe('RTL shared primitives', () => {
  test('a switch thumb travels toward the inline end and stays inside its track in RTL @scenario:rtl-switch-thumb-stays-in-track', async ({
    page,
  }) => {
    const dialog = await openGeneralSettings(page, 'rtl');
    const control = dialog.getByRole('switch').first();
    await expect(control).toBeVisible();

    const { checked, unchecked } = await bothStates(control);
    /** Unchecked rests on the inline start (the right in RTL), checked on the inline end. */
    expect(unchecked.fromRight).toBeLessThanOrEqual(unchecked.fromLeft);
    expect(checked.fromLeft).toBeLessThan(checked.fromRight);
    for (const reading of [checked, unchecked]) {
      expect(reading.fromLeft).toBeGreaterThanOrEqual(0);
      expect(reading.fromRight).toBeGreaterThanOrEqual(0);
    }
  });

  test('a dialog puts its close button on the inline end, clear of its title, in RTL @scenario:rtl-dialog-close-button-mirrors', async ({
    page,
  }) => {
    const dialog = await openArchivedChats(page, 'rtl');
    const layout = await archivedLayout(dialog);

    expect(layout.closeCenter).toBeLessThan(layout.dialogWidth / 2);
    expect(layout.textOverlapsClose).toBe(false);
  });

  test('an LTR page keeps the switch thumb and dialog close button on their physical sides @scenario:ltr-primitives-keep-physical-sides', async ({
    page,
  }) => {
    const settings = await openGeneralSettings(page, 'ltr');
    const control = settings.getByRole('switch').first();
    await expect(control).toBeVisible();
    const { checked, unchecked } = await bothStates(control);
    expect(unchecked.fromLeft).toBeLessThanOrEqual(unchecked.fromRight);
    expect(checked.fromRight).toBeLessThan(checked.fromLeft);
    for (const reading of [checked, unchecked]) {
      expect(reading.fromLeft).toBeGreaterThanOrEqual(0);
      expect(reading.fromRight).toBeGreaterThanOrEqual(0);
    }

    const dialog = await openArchivedChats(page, 'ltr');
    const layout = await archivedLayout(dialog);
    expect(layout.closeCenter).toBeGreaterThan(layout.dialogWidth / 2);
    expect(layout.textOverlapsClose).toBe(false);
  });
});
