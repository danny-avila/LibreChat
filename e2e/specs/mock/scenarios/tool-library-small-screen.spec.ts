import { devices, expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openAgentBuilder } from '../agents.helpers';

const TOOL_LIBRARY = 'Tool Library';

async function openToolLibrary(page: Page): Promise<Locator> {
  const form = await openAgentBuilder(page);
  await form.getByRole('button', { name: 'Add tools' }).click();
  const dialog = page.getByRole('dialog', { name: TOOL_LIBRARY });
  await expect(dialog).toBeVisible();
  return dialog;
}

function catalogCards(dialog: Locator): Locator {
  return dialog.getByRole('list', { name: TOOL_LIBRARY }).locator(':scope > li');
}

async function computedOpacity(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).opacity);
}

async function blurAndMovePointer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
  await page.mouse.move(0, 0);
}

test.describe('tool library on a touch viewport', () => {
  test.use({ viewport: devices['Pixel 7'].viewport, hasTouch: true });

  test('@scenario:tool-library-fills-a-phone-viewport the catalog stays within a phone viewport', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBe(0);
    expect(dialogBox!.width).toBe(viewport!.width);
    await expect(dialog.locator('aside')).toHaveCount(0);
    await expect(dialog.getByRole('group', { name: TOOL_LIBRARY })).toBeVisible();

    const cards = catalogCards(dialog);
    await expect(cards.first()).toBeVisible();
    for (let index = 0; index < (await cards.count()); index += 1) {
      const cardBox = await cards.nth(index).boundingBox();
      expect(cardBox).not.toBeNull();
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport!.width);
  });

  test('@scenario:tool-library-filter-chips-narrow-the-catalog filter chips narrow the catalog and expose an empty favorites state', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    const cards = catalogCards(dialog);
    const allChip = dialog.getByRole('button', { name: /^All(?:\s+\d+)?$/ });
    await expect(allChip).toHaveAttribute('aria-pressed', 'true');
    const allCount = await cards.count();

    const mcpChip = dialog.getByRole('button', { name: /^MCP servers(?:\s+\d+)?$/ });
    const mcpCount = Number.parseInt((await mcpChip.locator('span').last().innerText()).trim(), 10);
    expect(mcpCount).toBeGreaterThan(0);
    await mcpChip.click();
    await expect.poll(() => cards.count()).toBe(mcpCount);
    expect(await cards.count()).toBeLessThan(allCount);

    await dialog.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(
      dialog.getByText("You haven't favorited anything yet", { exact: true }),
    ).toBeVisible();
    await expect(cards).toHaveCount(0);
  });

  test('@scenario:tool-card-actions-are-visible-without-hover-on-touch card actions are visible without hover on a coarse pointer', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    await blurAndMovePointer(page);

    const configure = dialog.getByRole('button', { name: 'Configure', exact: true }).first();
    const favorite = dialog.getByRole('button', { name: 'Add to favorites', exact: true }).first();
    await expect(configure).toBeVisible();
    await expect(favorite).toBeVisible();
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
    expect(await computedOpacity(configure)).toBe('1');
    expect(await computedOpacity(favorite)).toBe('1');
  });

  test('@scenario:tool-row-actions-are-visible-without-hover-on-touch selected tool row actions stay visible without hover', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const form = await openAgentBuilder(page);
    await form.getByRole('button', { name: 'Add tools' }).click();
    const dialog = page.getByRole('dialog', { name: TOOL_LIBRARY });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Search tools…' }).fill('Calculator');
    const calculator = dialog.getByRole('button', { name: /^Calculator/ }).first();
    await expect(calculator).toBeVisible();
    await calculator.click();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    const row = form.locator('li').filter({ hasText: 'Calculator' }).first();
    await expect(row).toBeVisible();
    const details = row.getByRole('button', { name: 'Tool details', exact: true });
    const remove = row.getByRole('button', { name: 'Remove from agent', exact: true });
    const actionWrapper = details.locator('xpath=..');
    await expect(details).toBeVisible();
    await expect(remove).toBeVisible();
    expect(await computedOpacity(details)).toBe('1');
    expect(await computedOpacity(remove)).toBe('1');
    expect(await computedOpacity(actionWrapper)).toBe('1');
  });
});

test.describe('tool library on a mouse viewport', () => {
  test('@scenario:tool-card-actions-stay-hover-gated-with-a-mouse card actions remain hidden until hover on a mouse', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    await blurAndMovePointer(page);

    const configure = dialog.getByRole('button', { name: 'Configure', exact: true }).first();
    const card = configure.locator('xpath=ancestor::li[1]');
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(false);
    expect(await computedOpacity(configure)).toBe('0');
    await card.hover();
    await expect.poll(() => computedOpacity(configure)).toBe('1');
  });

  test('@scenario:tool-card-action-is-revealed-by-keyboard-focus keyboard focus reveals a card action', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    await blurAndMovePointer(page);

    const configure = dialog.getByRole('button', { name: 'Configure', exact: true }).first();
    const card = configure.locator('xpath=ancestor::li[1]');
    const cardButton = card.getByRole('button').first();
    await cardButton.focus();
    await cardButton.press('Tab');
    await expect(configure).toBeFocused();
    expect(await configure.evaluate((element) => document.activeElement === element)).toBe(true);
    expect(await configure.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect(await computedOpacity(configure)).toBe('1');
  });

  test('@scenario:tool-library-keeps-its-rail-on-desktop the desktop rail contains kind entries', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openToolLibrary(page);
    const rail = dialog.locator('aside');
    await expect(rail).toBeVisible();
    for (const name of ['All', 'Native', 'Tools', 'MCP servers', 'Actions']) {
      await expect(
        rail.getByRole('button', { name: new RegExp(`^${name}(?:\\s+\\d+)?$`) }),
      ).toBeVisible();
    }
    await expect(dialog.getByRole('group', { name: TOOL_LIBRARY })).toHaveCount(0);
  });
});
