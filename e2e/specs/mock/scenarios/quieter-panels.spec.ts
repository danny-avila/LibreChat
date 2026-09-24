import { expect, test } from '@playwright/test';
import type { TSchedule, TSchedulesResponse } from 'librechat-data-provider';
import type { Page } from '@playwright/test';
import type { AgentSummary } from '../agents.helpers';
import { getAccessToken, requestJson, uniqueName } from '../helpers';
import { cleanupAgent } from '../agents.helpers';
import { openPanel } from './panels';

async function seedSchedules(page: Page, count: number) {
  const token = await getAccessToken(page);
  const agent = await requestJson<AgentSummary>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: { name: uniqueName('Panel agent'), provider: 'Mock Provider A', model: 'mock-model-a' },
  });
  const schedules: TSchedule[] = [];
  try {
    for (let index = 0; index < count; index++) {
      schedules.push(
        await requestJson<TSchedule>(page, {
          path: '/api/schedules',
          token,
          method: 'POST',
          body: {
            name: uniqueName(`Panel schedule ${index}`),
            prompt: 'Summarize the day',
            agent_id: agent.id,
            cadence: { frequency: 'daily', hour: 0, minute: 0 },
            timezone: 'UTC',
            target: 'new',
            enabled: true,
            clientRequestId: uniqueName('panel-intent'),
          },
        }),
      );
    }
  } catch (error) {
    await cleanupSchedules(page, { token, agent, schedules });
    throw error;
  }
  return { token, agent, schedules };
}

async function cleanupSchedules(page: Page, fixture: Awaited<ReturnType<typeof seedSchedules>>) {
  for (const schedule of fixture.schedules) {
    await requestJson(page, {
      path: `/api/schedules/${encodeURIComponent(schedule.id)}`,
      token: fixture.token,
      method: 'DELETE',
    });
  }
  await cleanupAgent(page, fixture.agent.id);
}

test.describe('quieter management panels', () => {
  test('filtering preserves capacity and usable row controls @scenario:schedule-filter-keeps-quota-and-actions', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/c/new');
    const token = await getAccessToken(page);
    const initial = await requestJson<TSchedulesResponse>(page, { path: '/api/schedules', token });
    expect(initial.schedules).toHaveLength(0);
    const fixture = await seedSchedules(page, initial.limits.maxPerUser);

    try {
      await openPanel(page, 'schedules', 'Scheduled chats');
      const panel = page.getByRole('region', { name: 'Scheduled chats', exact: true });
      const count = fixture.schedules.length;
      const quota = panel.getByText(`${count} of ${initial.limits.maxPerUser} schedules used`);
      const create = panel.getByRole('button', { name: 'New schedule', exact: true });
      const filter = panel.getByRole('textbox', { name: 'Filter schedules...' });
      const schedule = fixture.schedules[0];

      await expect(panel.getByTestId('schedule-card')).toHaveCount(count);
      await filter.fill(schedule.name);
      await expect(panel.getByTestId('schedule-card')).toHaveCount(1);
      await expect(quota).toBeVisible();
      await expect(create).toBeDisabled();

      await filter.fill('no matching schedule');
      await expect(panel.getByText('No schedules match your search')).toBeVisible();
      await expect(quota).toBeVisible();
      await expect(create).toBeDisabled();
      await filter.clear();

      const card = panel.getByTestId('schedule-card').filter({ hasText: schedule.name });
      const toggle = card.getByRole('switch', { name: `Enabled: ${schedule.name}`, exact: true });
      await expect(toggle).toBeChecked();
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await toggle.press('Tab');
      const menu = card.getByRole('button', {
        name: `Schedule options: ${schedule.name}`,
        exact: true,
      });
      await expect(menu).toBeFocused();
      await menu.press('Enter');
      await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Edit schedule' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Edit schedule' })).toBeHidden();

      await page.reload();
      await openPanel(page, 'schedules', 'Scheduled chats');
      await expect(toggle).not.toBeChecked();
    } finally {
      await cleanupSchedules(page, fixture);
    }
  });

  test('loading rows keep their height and failed lists offer retry @scenario:schedule-loading-and-error-preserve-panel-usability', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/c/new');
    const fixture = await seedSchedules(page, 5);
    let releaseLoading = () => {};
    const loading = new Promise<void>((resolve) => {
      releaseLoading = resolve;
    });
    let failRequests = false;
    await page.route('**/api/schedules', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      if (failRequests) {
        await route.fulfill({ status: 503, json: { message: 'Schedule service unavailable' } });
        return;
      }
      const response = await route.fetch();
      await loading;
      await route.fulfill({ response });
    });

    try {
      await openPanel(page, 'schedules', 'Scheduled chats');
      const panel = page.getByRole('region', { name: 'Scheduled chats', exact: true });
      const create = panel.getByRole('button', { name: 'New schedule', exact: true });
      const busy = panel.locator('[aria-busy="true"]');
      const placeholders = busy.locator(':scope > [aria-hidden="true"] > div');
      await expect(placeholders).toHaveCount(5);
      await expect(create).toBeDisabled();
      const loadingHeight = await placeholders
        .first()
        .evaluate((row) => row.getBoundingClientRect().height);
      releaseLoading();

      const rows = panel.getByTestId('schedule-card');
      await expect(rows).toHaveCount(5);
      const loadedHeight = await rows.first().evaluate((row) => row.getBoundingClientRect().height);
      expect(Math.abs(loadedHeight - loadingHeight)).toBeLessThanOrEqual(1);
      await expect(create).toBeEnabled();

      failRequests = true;
      await page.reload();
      await openPanel(page, 'schedules', 'Scheduled chats');
      await expect(panel.getByText("Couldn't load your scheduled chats")).toBeVisible({
        timeout: 20_000,
      });
      await expect(create).toBeDisabled();
      failRequests = false;
      await panel.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(rows).toHaveCount(5);
      await expect(create).toBeEnabled();
    } finally {
      releaseLoading();
      await page.unroute('**/api/schedules');
      await cleanupSchedules(page, fixture);
    }
  });

  test('skill files expand and collapse from the keyboard @scenario:skill-files-disclosure-opens-by-keyboard', async ({
    page,
  }) => {
    await page.goto('/c/new');
    await openPanel(page, 'skills', 'Skills');
    const disclosure = page.getByRole('button', {
      name: 'Toggle files for e2e-deployment-skill',
      exact: true,
    });
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await disclosure.focus();
    await disclosure.press('Enter');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const file = page.getByRole('button', { name: 'guide.txt', exact: true });
    await expect(file).toBeVisible();
    await disclosure.press('Space');
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(file).toHaveCount(0);
    await disclosure.press('Enter');
    await file.click();
    await expect(page).toHaveURL(/\/skills\/[^?]+\?file=guide.txt$/);
    await expect(page.getByText('deployment skill file fixture', { exact: true })).toBeVisible();
  });
});
