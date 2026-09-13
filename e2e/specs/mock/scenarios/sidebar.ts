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

/** The row mounts its real menu on the first mouse enter (`Convo.tsx`). Hovering is what a
 * pointer device does, but the mobile drawer cannot always offer a hoverable row, and a real
 * `hover()` then waits out the whole budget. The fallback dispatches `mouseover`, which is the
 * native event React derives `onMouseEnter` from, and needs the row only to be attached. */
export async function openConversationMenu(row: Locator) {
  const menu = row.getByRole('button', { name: 'Conversation Menu Options' });
  if (!(await menu.isVisible().catch(() => false))) {
    await row.hover({ timeout: 5_000 }).catch(() => undefined);
  }
  if (!(await menu.isVisible().catch(() => false))) {
    await row.dispatchEvent('mouseover');
  }
  await expect(menu).toBeAttached();
  await menu.dispatchEvent('click');
}
