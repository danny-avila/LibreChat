import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { AgentDetail } from './agents.helpers';
import { cleanupAgent, openAgentBuilder, uniqueAgentName } from './agents.helpers';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  getAccessToken,
  messagesView,
  replyPrompt,
  replyText,
  requestJson,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from './helpers';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 900 };

function overlayToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const state = history.state as {
      librechatOverlay?: { token: string; kind: string };
    } | null;
    return state?.librechatOverlay?.kind === 'open' ? state.librechatOverlay.token : null;
  });
}

async function backClosesOverlay(page: Page, overlay: Locator, chatUrl: string): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlayToken(page)).toBeTruthy();
  await page.evaluate(() => history.back());
  await expect(overlay).toBeHidden();
  /** Wait for the close lifecycle to consume its entry, not just change the UI. */
  await expect.poll(() => overlayToken(page)).toBeNull();
  await expect(page).toHaveURL(chatUrl);
}

async function enterMobileChat(page: Page): Promise<void> {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await expect(page.getByTestId('header-open-sidebar-button')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message input', exact: true })).toBeVisible();
  await expect.poll(() => overlayToken(page)).toBeNull();
}

async function prepareMockChat(page: Page, prompt: string): Promise<string> {
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto(NEW_CHAT_PATH);
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
  const response = await sendMessageAndWaitForCompletion(page, prompt);
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden();
  await enterMobileChat(page);
  return page.url();
}

test.describe('mobile browser Back dismisses overlays before leaving chat', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('keeps the Agent instructions draft when Back closes the expanded editor', async ({
    page,
  }) => {
    const label = 'mobile-instructions-back';
    const chatUrl = await prepareMockChat(page, replyPrompt(label));
    await page.getByTestId('header-open-sidebar-button').click();
    await page.getByTestId('panel-switcher-button').click();
    await page.getByRole('menuitemcheckbox', { name: 'Agent Builder', exact: true }).click();

    const form = page.getByRole('form', { name: 'Agent configuration form' });
    const agentName = uniqueAgentName('E2E Back Draft');
    await form.getByLabel('Agent name').fill(agentName);
    await form.getByRole('button', { name: 'Expand editor', exact: true }).click();

    const editor = page.getByRole('dialog', { name: 'Instructions', exact: true });
    const draft = 'Keep this unsaved instruction draft.\nDo not navigate away from the chat.';
    await editor.getByRole('textbox', { name: 'Instructions', exact: true }).fill(draft);
    await backClosesOverlay(page, editor, chatUrl);
    await expect(form.getByLabel('Instructions', { exact: true })).toHaveValue(draft);
    await expect(form.getByLabel('Agent name')).toHaveValue(agentName);

    await form.getByRole('button', { name: 'Expand editor', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveValue(
      draft,
    );
    await backClosesOverlay(page, editor, chatUrl);
    await page.getByTestId('close-sidebar-button').click();
    await expect(messagesView(page).getByText(replyText(label), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(chatUrl);
  });

  test('returns Settings detail to its list before closing Settings on the next Back', async ({
    page,
  }) => {
    const label = 'mobile-settings-back';
    const chatUrl = await prepareMockChat(page, replyPrompt(label));
    await page.goto('/search');
    await page.goto(chatUrl);
    await enterMobileChat(page);
    await page.getByTestId('header-open-sidebar-button').click();
    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();

    const settings = page.getByRole('dialog');
    const closeSettings = settings.getByRole('button', { name: 'Close Settings', exact: true });
    const list = settings.getByRole('tablist', { name: 'Settings', exact: true });
    await expect(list).toBeVisible();
    await expect.poll(() => overlayToken(page)).toBeTruthy();
    await settings.getByRole('tab', { name: 'General', exact: true }).click();
    const detailBack = settings.getByRole('button', { name: 'Back', exact: true });
    await expect(detailBack).toBeVisible();
    await expect(settings.getByRole('tabpanel')).toBeVisible();
    await expect(list).toBeHidden();

    await page.evaluate(() => history.back());
    await expect(detailBack).toBeHidden();
    await expect(list).toBeVisible();
    await expect(closeSettings).toBeVisible();
    await expect.poll(() => overlayToken(page)).toBeTruthy();
    await expect(page).toHaveURL(chatUrl);

    await backClosesOverlay(page, closeSettings, chatUrl);
    await page.getByTestId('close-sidebar-button').click();
    await expect(messagesView(page).getByText(replyText(label), { exact: true })).toBeVisible();
    await expect(page).toHaveURL(chatUrl);
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(/\/search$/);
  });

  test('closes the Artifacts overlay and keeps the conversation and artifact available', async ({
    page,
  }) => {
    const chatUrl = await prepareMockChat(page, 'E2E_MERMAID_ARTIFACT_REPLY');
    const messages = messagesView(page);
    await expect(messages.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible();
    await messages.getByRole('button', { name: 'Open as artifact', exact: true }).click();

    const panel = page.getByRole('dialog', { name: 'Mermaid diagram', exact: true });
    await expect(panel.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible();
    await backClosesOverlay(page, panel, chatUrl);
    const artifact = messages.locator('[data-artifact-trigger^="mermaid-artifact-"]');
    await expect(artifact).toBeVisible();
    await expect(artifact).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('textbox', { name: 'Message input', exact: true })).toBeVisible();

    await artifact.click();
    await expect(panel.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible();
    await backClosesOverlay(page, panel, chatUrl);
    await expect(artifact).toHaveAttribute('aria-expanded', 'false');
  });

  test('closes child agent progress without leaving the parent conversation or losing activity', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const label = `mobile-back-${Date.now().toString(36)}`;
    const createdAgentIds: string[] = [];

    try {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await page.goto(NEW_CHAT_PATH);
      const token = await getAccessToken(page);
      const parentName = uniqueAgentName('E2E Back Parent');
      const childIds: string[] = [];
      for (const name of [
        uniqueAgentName('E2E Back Child A'),
        uniqueAgentName('E2E Back Child B'),
        parentName,
      ]) {
        const agent = await requestJson<AgentDetail>(page, {
          path: '/api/agents',
          token,
          method: 'POST',
          body: {
            name,
            instructions: 'Follow the deterministic end-to-end request exactly.',
            provider: MOCK_ENDPOINTS[0].label,
            model: MOCK_ENDPOINTS[0].model,
            ...(name === parentName
              ? { subagents: { enabled: true, allowSelf: false, agent_ids: childIds } }
              : {}),
          },
        });
        createdAgentIds.push(agent.id);
        if (name !== parentName) {
          childIds.push(agent.id);
        }
      }

      const form = await openAgentBuilder(page);
      await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
      await page.getByRole('option', { name: parentName, exact: true }).click();
      await expect(form.getByLabel('Agent name')).toHaveValue(parentName);
      await form.getByRole('button', { name: 'Select Agent' }).click();
      const response = await sendMessageAndWaitForCompletion(
        page,
        `E2E_SUBAGENT_ACTIVITY:${childIds.join(',')}:${label}`,
      );
      expect(response.ok()).toBeTruthy();
      await enterMobileChat(page);
      const chatUrl = page.url();
      const parentReply = messagesView(page).getByText(
        `E2E detached subagents dispatched ${label}`,
        { exact: true },
      );
      await expect(parentReply).toBeVisible();
      await page.getByRole('button', { name: 'Ran 2 agents', exact: true }).click();
      const cards = page.locator('[data-subagent-tool-call^="call_e2e_subagent_activity_"]');
      await expect(cards).toHaveCount(2);
      await cards.first().click();

      const panel = page.getByRole('dialog', { name: 'Child agent activity', exact: true });
      await expect(panel).toContainText('child-1-phase-10', { timeout: 30_000 });
      await backClosesOverlay(page, panel, chatUrl);
      await expect(parentReply).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Message input', exact: true })).toBeVisible();

      await cards.first().click();
      await expect(panel).toContainText(`E2E detached child 1 complete ${label}`, {
        timeout: 30_000,
      });
      await backClosesOverlay(page, panel, chatUrl);
      await expect(parentReply).toBeVisible();
    } finally {
      for (const agentId of createdAgentIds.reverse()) {
        await cleanupAgent(page, agentId);
      }
    }
  });
});
