import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Mobile keeps the conversation list in a drawer; desktop has it expanded already. */
export async function openSidebar(page: Page) {
  const close = page.getByTestId('close-sidebar-button');
  if (await close.isVisible()) {
    return;
  }
  const headerOpen = page.getByTestId('header-open-sidebar-button');
  if (await headerOpen.isVisible()) {
    await headerOpen.click();
    await expect(close).toBeVisible();
    return;
  }
  const railOpen = page.getByTestId('open-sidebar-button');
  if (await railOpen.isVisible()) {
    await railOpen.click();
    await expect(close).toBeVisible();
  }
}

/** Touch has no hover, so the control is revealed rather than pointed at. */
export async function openConversationMenu(row: Locator) {
  const menu = row.getByRole('button', { name: 'Conversation Menu Options' });
  if (!(await menu.isVisible().catch(() => false))) {
    await row.hover();
  }
  await menu.dispatchEvent('click');
}
