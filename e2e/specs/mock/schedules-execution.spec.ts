import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getAccessToken, requestJson, replyPrompt, replyText } from './helpers';

const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

type AgentSummary = { id: string; name?: string };
type AgentList = { data?: AgentSummary[] };
type Schedule = {
  id: string;
  name: string;
  nextRunAt?: string;
  enabled?: boolean;
  cadence?: { frequency: string; hour?: number; minute?: number };
  lastRun?: { status: string; conversationId?: string };
  runCount?: number;
};
type ScheduleList = { schedules: Schedule[] };
type RunNowResult = { scheduleId: string; conversationId?: string; status?: string };

async function ensureAgent(page: Page, token: string): Promise<AgentSummary> {
  const list = await requestJson<AgentList>(page, { path: '/api/agents?limit=1', token }).catch(
    () => ({}) as AgentList,
  );
  const existing = list.data?.[0];
  if (existing?.id) {
    return existing;
  }
  const agent = await requestJson<AgentSummary>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: { name: uniqueName('E2E Agent'), provider: 'Mock Provider A', model: 'mock-model-a' },
  });
  expect(agent.id).toBeTruthy();
  return agent;
}

async function createSchedule(
  page: Page,
  token: string,
  body: Record<string, unknown>,
): Promise<Schedule> {
  const schedule = await requestJson<Schedule>(page, {
    path: '/api/schedules',
    token,
    method: 'POST',
    body,
  });
  expect(schedule.id).toBeTruthy();
  return schedule;
}

async function readSchedule(page: Page, token: string, id: string): Promise<Schedule | undefined> {
  const list = await requestJson<ScheduleList>(page, { path: '/api/schedules', token });
  return list.schedules.find((s) => s.id === id);
}

async function openSchedulesPanel(page: Page) {
  const navButton = page.getByRole('button', { name: 'Scheduled chats' });
  await expect(navButton).toBeVisible();
  if ((await navButton.getAttribute('aria-pressed')) !== 'true') {
    await navButton.click();
  }
  const panel = page.getByRole('region', { name: 'Scheduled chats' });
  await expect(panel).toBeVisible({ timeout: 15000 });
  return panel;
}

const scheduleBody = (agentId: string, over: Record<string, unknown> = {}) => ({
  name: uniqueName('E2E Schedule'),
  prompt: 'Summarize what happened today',
  agent_id: agentId,
  cadence: { frequency: 'daily', hour: 8, minute: 0 },
  timezone: 'America/New_York',
  target: 'new',
  enabled: true,
  ...over,
});

test.describe('scheduled chat execution', () => {
  /**
   * Run Now is the one path that dispatches a real generation on demand, so it is
   * where a broken loopback URL, a rejected fire token, or a lost schedule identity
   * surfaces. The smoke spec only proves the card renders.
   */
  test('Run Now generates a conversation and records it on the schedule', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/c/new', { timeout: 15000 });
    const token = await getAccessToken(page);
    const agent = await ensureAgent(page, token);
    const label = `sched-${Date.now()}`;
    const schedule = await createSchedule(
      page,
      token,
      scheduleBody(agent.id, { prompt: replyPrompt(label) }),
    );

    // A skip/throttle answers 409/429, which requestJson surfaces as a throw.
    const result = await requestJson<RunNowResult>(page, {
      path: `/api/schedules/${schedule.id}/run`,
      token,
      method: 'POST',
    });
    expect(result.status).toBe('started');
    expect(result.conversationId).toBeTruthy();

    // Poll the schedule until the run's own completion hook records its outcome.
    await expect
      .poll(async () => (await readSchedule(page, token, schedule.id))?.lastRun?.status, {
        timeout: 60000,
        intervals: [1000],
      })
      .toBe('success');

    const settled = await readSchedule(page, token, schedule.id);
    expect(settled?.runCount).toBe(1);
    const conversationId = settled?.lastRun?.conversationId;
    expect(conversationId).toBeTruthy();

    // The generated chat is real and reachable: the agent's reply is persisted.
    await page.goto(`/c/${conversationId}`, { timeout: 15000 });
    await expect(page.getByTestId('messages-view')).toContainText(replyText(label), {
      timeout: 20000,
    });
  });

  /**
   * A due schedule must fire on the engine's own tick — no user action — exactly once,
   * and then advance past the occurrence. TICK_MS is 30s, so budget for one tick.
   */
  test('a due schedule fires automatically, once, and advances', async ({ page }) => {
    // Worst case: up to 60s to the minute boundary, one 30s engine tick, then the
    // generation itself.
    test.setTimeout(240000);
    await page.goto('/c/new', { timeout: 15000 });
    const token = await getAccessToken(page);
    const agent = await ensureAgent(page, token);
    const label = `auto-${Date.now()}`;
    // Hourly on the upcoming minute: the soonest occurrence this cadence can express.
    const schedule = await createSchedule(
      page,
      token,
      scheduleBody(agent.id, {
        prompt: replyPrompt(label),
        cadence: { frequency: 'hourly', minute: (new Date().getUTCMinutes() + 1) % 60 },
        timezone: 'UTC',
      }),
    );
    const before = await readSchedule(page, token, schedule.id);
    expect(before?.nextRunAt).toBeTruthy();

    await expect
      .poll(async () => (await readSchedule(page, token, schedule.id))?.lastRun?.status, {
        timeout: 180000,
        intervals: [2000],
      })
      .toBe('success');

    const after = await readSchedule(page, token, schedule.id);
    // Exactly one run, and the occurrence was advanced rather than re-fired.
    expect(after?.runCount).toBe(1);
    expect(new Date(after!.nextRunAt!).getTime()).toBeGreaterThan(
      new Date(before!.nextRunAt!).getTime(),
    );
  });

  test('rejects an invalid timezone before persisting anything', async ({ page }) => {
    await page.goto('/c/new', { timeout: 15000 });
    const token = await getAccessToken(page);
    const agent = await ensureAgent(page, token);

    const before = await requestJson<ScheduleList>(page, { path: '/api/schedules', token });
    const rejected = await requestJson<unknown>(page, {
      path: '/api/schedules',
      token,
      method: 'POST',
      body: scheduleBody(agent.id, { timezone: 'Not/AZone' }),
    }).then(
      () => null,
      (err: Error) => err.message,
    );

    expect(rejected).toMatch(/400/);
    const after = await requestJson<ScheduleList>(page, { path: '/api/schedules', token });
    expect(after.schedules).toHaveLength(before.schedules.length);
  });

  test('creates and edits a schedule through the UI with the cadence persisted', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto('/c/new', { timeout: 15000 });
    const token = await getAccessToken(page);
    await ensureAgent(page, token);

    await openSchedulesPanel(page);
    await page.getByRole('button', { name: 'New schedule' }).click();

    const dialog = page.getByRole('dialog');
    const name = uniqueName('UI Schedule');
    await dialog.locator('#schedule-name').fill(name);
    await dialog.locator('#schedule-prompt').fill('Daily standup summary');
    await dialog.getByRole('button', { name: 'Create' }).click();

    const card = page.getByTestId('schedule-card').filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 15000 });

    // The cadence survives a reload, i.e. it round-tripped through the backend.
    await page.reload();
    await openSchedulesPanel(page);
    const reloaded = page.getByTestId('schedule-card').filter({ hasText: name });
    await expect(reloaded).toContainText(/Runs daily/i, { timeout: 15000 });
  });
});
