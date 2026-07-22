import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/**
 * Seeds a minimal agent via the authenticated API (storageState) so the schedule
 * dialog's required agent picker has something to select. Returns the agent name.
 */
async function seedAgent(page: Page): Promise<string> {
  const name = uniqueName('E2E Agent');
  const response = await page.request.post('/api/agents', {
    data: { name, provider: 'Mock Provider A', model: 'mock-model-a' },
  });
  expect(response.ok()).toBeTruthy();
  const agent = await response.json();
  expect(agent.id).toBeTruthy();
  return name;
}

async function openSchedulesPanel(page: Page) {
  await page.getByTestId('nav-panel-scheduled').click();
  const panel = page.getByRole('region', { name: 'Scheduled chats' });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('scheduled chats', () => {
  test('creates, persists, toggles, and deletes a schedule', async ({ page }) => {
    test.setTimeout(120000);
    const agentName = await seedAgent(page);
    const scheduleName = uniqueName('E2E Schedule');

    await page.goto('/c/new', { timeout: 10000 });

    // Create a schedule through the dialog.
    let panel = await openSchedulesPanel(page);
    await panel.getByRole('button', { name: 'New schedule' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(scheduleName);
    await dialog.getByLabel('Prompt').fill('Summarize what happened today');

    // Pick the seeded agent (the picker shows the placeholder until one is chosen).
    await dialog.getByText('Select Agent').click();
    await page.getByRole('option', { name: agentName }).click();

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // The new schedule renders as a card.
    const card = page.getByTestId('schedule-card').filter({ hasText: scheduleName });
    await expect(card).toBeVisible({ timeout: 15000 });

    // It survives a full reload (persisted through the real backend + DB).
    await page.reload();
    panel = await openSchedulesPanel(page);
    const reloadedCard = page.getByTestId('schedule-card').filter({ hasText: scheduleName });
    await expect(reloadedCard).toBeVisible({ timeout: 15000 });

    // Toggling the enabled switch round-trips and re-reads from the server.
    const toggle = reloadedCard.getByRole('switch', { name: 'Enabled' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    // Delete it via the kebab menu + confirmation dialog.
    await reloadedCard.getByRole('button', { name: 'Schedule options' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: /delete schedule/i });
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByTestId('schedule-card').filter({ hasText: scheduleName })).toHaveCount(
      0,
      { timeout: 15000 },
    );
  });
});
