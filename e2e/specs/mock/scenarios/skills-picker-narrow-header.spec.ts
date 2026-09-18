import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { openAgentBuilder } from '../agents.helpers';

const TOLERANCE = 2;

type Box = { x: number; y: number; width: number; height: number };

async function getBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function expectClose(actual: number, expected: number, tolerance = TOLERANCE) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

async function openSkillsPicker(page: Page): Promise<Locator> {
  const form = await openAgentBuilder(page);
  await form.getByRole('radio', { name: 'Selected', exact: true }).click();
  const addSkill = form.getByRole('button', { name: 'Add skill', exact: true });
  await expect(addSkill).toBeVisible();
  await addSkill.click();

  const dialog = page.getByRole('dialog', { name: 'Skills', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

function headerParts(dialog: Locator) {
  const header = dialog
    .getByRole('heading', { name: 'Skills', exact: true })
    .locator('..')
    .locator('..');
  const view = dialog.getByRole('radiogroup', { name: 'Filter skills', exact: true });
  const create = dialog.getByRole('button', { name: 'Create Skill', exact: true });
  const filter = dialog.getByRole('textbox', { name: 'Search skills...', exact: true });
  return { header, view, create, filter };
}

async function expectNoHeaderOverflow(header: Locator) {
  await expect
    .poll(() => header.evaluate((element) => element.scrollWidth === element.clientWidth))
    .toBe(true);
}

async function expectOptionsInsideDialog(dialog: Locator, view: Locator) {
  const dialogBox = await getBox(dialog);
  const options = view.getByRole('radio');
  const count = await options.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const optionBox = await getBox(options.nth(index));
    expect(optionBox.x).toBeGreaterThanOrEqual(dialogBox.x - TOLERANCE);
    expect(optionBox.y).toBeGreaterThanOrEqual(dialogBox.y - TOLERANCE);
    expect(optionBox.x + optionBox.width).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + TOLERANCE,
    );
    expect(optionBox.y + optionBox.height).toBeLessThanOrEqual(
      dialogBox.y + dialogBox.height + TOLERANCE,
    );
  }
}

async function expectIndicatorMatchesChecked(view: Locator) {
  const indicator = view.locator(':scope > div').first();
  const checked = view.getByRole('radio', { name: 'Favorites', exact: true });
  await expect(indicator).toBeVisible();
  await expect(checked).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => {
      const indicatorBox = await indicator.boundingBox();
      const checkedBox = await checked.boundingBox();
      if (!indicatorBox || !checkedBox) {
        return false;
      }
      return (
        Math.abs(indicatorBox.x - checkedBox.x) <= TOLERANCE &&
        Math.abs(indicatorBox.y - checkedBox.y) <= TOLERANCE &&
        Math.abs(indicatorBox.width - checkedBox.width) <= TOLERANCE &&
        Math.abs(indicatorBox.height - checkedBox.height) <= TOLERANCE
      );
    })
    .toBe(true);
}

test.describe('skills picker header on a phone', () => {
  test.use({ viewport: devices['Pixel 7'].viewport, hasTouch: true });

  test('@scenario:skills-picker-header-splits-on-a-phone-viewport splits the skills header into two rows on a phone', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openSkillsPicker(page);
    const { header, view, create, filter } = headerParts(dialog);
    const row = view.locator('..');
    const dialogBox = await getBox(dialog);
    const viewBox = await getBox(view);
    const createBox = await getBox(create);
    const filterBox = await getBox(filter);
    const rowBox = await getBox(row);

    expectClose(viewBox.y, createBox.y);
    expect(createBox.x).toBeGreaterThan(viewBox.x);
    expect(createBox.x).toBeGreaterThanOrEqual(dialogBox.x - TOLERANCE);
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + TOLERANCE,
    );
    expectClose(createBox.x + createBox.width, rowBox.x + rowBox.width);
    expect(filterBox.y).toBeGreaterThan(viewBox.y + viewBox.height);
    expectClose(filterBox.x, rowBox.x);
    expectClose(filterBox.x + filterBox.width, rowBox.x + rowBox.width);
    await expectNoHeaderOverflow(header);
  });
});

test.describe('skills picker view options at narrow widths', () => {
  test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

  test('@scenario:skills-picker-view-options-stay-reachable-at-320px keeps every wrapped view option reachable at narrow widths', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const dialog = await openSkillsPicker(page);
    const { header, view } = headerParts(dialog);

    await expectOptionsInsideDialog(dialog, view);
    await expectNoHeaderOverflow(header);

    await page.setViewportSize({ width: 280, height: 800 });
    await expect(dialog).toBeVisible();
    await expectOptionsInsideDialog(dialog, view);
    await expectNoHeaderOverflow(header);

    const favorites = view.getByRole('radio', { name: 'Favorites', exact: true });
    await favorites.click();
    await expect(favorites).toHaveAttribute('aria-checked', 'true');
    await expect(
      dialog.getByText("You haven't favorited anything yet", { exact: true }),
    ).toBeVisible();
    await expectIndicatorMatchesChecked(view);
  });
});

test('@scenario:skills-picker-header-is-one-row-on-desktop keeps desktop header controls on one row', async ({
  page,
}) => {
  test.setTimeout(120000);
  const dialog = await openSkillsPicker(page);
  const { view, create, filter } = headerParts(dialog);
  const createBox = await getBox(create);
  const filterBox = await getBox(filter);
  const viewBox = await getBox(view);

  expectClose(createBox.y, filterBox.y);
  expectClose(filterBox.y, viewBox.y);
  expect(createBox.x).toBeLessThan(filterBox.x);
  expect(filterBox.x).toBeLessThan(viewBox.x);
  expect(filterBox.width).toBeGreaterThan(createBox.width);
  expect(filterBox.width).toBeGreaterThan(viewBox.width);
});
