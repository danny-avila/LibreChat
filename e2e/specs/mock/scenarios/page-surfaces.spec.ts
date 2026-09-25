import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { openSidebar } from './sidebar';

/**
 * A floating label breaks its field's top border, so it paints over the border
 * with the colour behind it. When a page moves to another surface, a label still
 * painting the old one shows as a patch across the border.
 */
async function paintsItsBackdrop(notch: Locator): Promise<{ notch: string; backdrop: string }> {
  return notch.evaluate((element) => {
    const opaque = (node: Element) => {
      const color = getComputedStyle(node).backgroundColor;
      return color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color);
    };
    let node = element.parentElement;
    while (node && !opaque(node)) {
      node = node.parentElement;
    }
    return {
      notch: getComputedStyle(element).backgroundColor,
      backdrop: node ? getComputedStyle(node).backgroundColor : 'none',
    };
  });
}

test.describe('page surfaces', () => {
  test('floating field labels paint the surface of the page they sit on @scenario:field-labels-match-page-surface', async ({
    page,
  }) => {
    await page.goto('/agents');
    const search = page.locator('#agent-search');
    await expect(search).toBeVisible({ timeout: 20_000 });
    const marketplace = await paintsItsBackdrop(search.locator('..'));
    expect(marketplace.notch).toBe(marketplace.backdrop);

    await page.goto('/skills/new');
    const nameLabel = page.locator('label[for="skill-name"]');
    await expect(nameLabel).toBeVisible({ timeout: 20_000 });
    const skill = await paintsItsBackdrop(nameLabel);
    expect(skill.notch).toBe(skill.backdrop);
  });

  test('Escape during IME composition keeps the search @scenario:search-escape-leaves-ime-composition', async ({
    page,
  }) => {
    await page.goto('/c/new');
    await openSidebar(page);
    const search = page.getByTestId('nav-search-input');
    await search.fill('konnichiwa');
    await expect(search).toHaveValue('konnichiwa');

    await search.dispatchEvent('keydown', { key: 'Escape', code: 'Escape', isComposing: true });
    await expect(search).toHaveValue('konnichiwa');

    await search.press('Escape');
    await expect(search).toHaveValue('');
  });
});
