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

/** The row mounts its real menu on the first mouse enter or focus (`Convo.tsx`). Touch has
 * neither, and a real `hover()` waits for actionability the mobile drawer cannot always offer,
 * so the reveal is dispatched rather than pointed: `dispatchEvent` only needs the element to be
 * attached, which is exactly the precondition that holds here. */
export async function openConversationMenu(row: Locator) {
  const menu = row.getByRole('button', { name: 'Conversation Menu Options' });
  if (!(await menu.isVisible().catch(() => false))) {
    await row.dispatchEvent('mouseenter');
  }
  await expect(menu).toBeAttached();
  await menu.dispatchEvent('click');
}
