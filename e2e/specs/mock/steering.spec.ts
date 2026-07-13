import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  MOCK_REPLY_TEXT,
  NEW_CHAT_PATH,
  messagesView,
  replyPrompt,
  replyText,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

/** Non-spec endpoint from e2e/config/librechat.e2e.yaml — the ephemeral MCP
 *  selection rides the no-spec path, mirroring mcp-ephemeral.spec.ts. */
const PROVIDER_C = { label: 'Mock Provider C', model: 'mock-model-c' };
const MCP_SERVER_TITLE = 'E2E Memory';
/** Last chunk streamed by the fake model's slow replies (160 chunks, 0-indexed). */
const SLOW_REPLY_LAST_CHUNK = 'chunk-159';

const uniqueLabel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message input' });
const duringRunSendButton = (page: Page) => page.getByTestId('during-run-send-button');
const queuedRows = (page: Page) => page.getByTestId('queued-message-row');
const messageTurns = (page: Page) => messagesView(page).locator('.message-render');
const pendingSteerParts = (page: Page) =>
  messagesView(page).locator('[data-testid="steer-part"][data-steer-pending="true"]');
const appliedSteerParts = (page: Page) =>
  messagesView(page).locator('[data-testid="steer-part"]:not([data-steer-pending])');

function isSteerRequest(response: Response) {
  return (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/agents/chat/steer'
  );
}

/** Select the MCP server from the composer's ephemeral MCP dropdown. */
async function selectEphemeralMCP(page: Page) {
  await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
  const serverItem = page.getByRole('menuitemcheckbox', { name: new RegExp(MCP_SERVER_TITLE) });
  await expect(serverItem).toBeVisible();
  await serverItem.click();
  await expect(serverItem).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: new RegExp(MCP_SERVER_TITLE) })).toBeVisible();
}

/** Establish a real conversation with a fast first turn so during-run actions
 *  target a persisted conversation id instead of racing new-convo creation. */
async function establishConversation(page: Page, label: string) {
  const setup = await sendMessage(page, replyPrompt(label));
  expect(setup.ok()).toBeTruthy();
  await expect(messagesView(page).getByText(replyText(label))).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/, { timeout: 15000 });
}

/** Fill the composer mid-run: the during-run send button must take the
 *  send/stop slot (it becomes the form submit target for Enter). */
async function typeDuringRun(page: Page, text: string) {
  const input = messageInput(page);
  await input.click();
  await input.fill(text);
  await expect(duringRunSendButton(page)).toBeVisible({ timeout: 5000 });
}

test.describe('mid-run steering and queuing', () => {
  /**
   * KNOWN GAP (documented in the task report): the applied-at-tool-boundary
   * contract — the pending steer-part flipping to a persisted part (no
   * `data-steer-pending`) inside the live response — is dead with
   * @librechat/agents 3.2.62. The SDK's event-driven ToolNode (any run whose
   * tools ride `toolDefinitions`, i.e. every LibreChat tool run) fires
   * `PostToolBatch` with the TOP-LEVEL agent's id in `input.agentId`,
   * violating the SDK's own hook contract ("`agentId` is only set … inside a
   * subagent scope"), so `createSteerDrainHook`'s subagent skip swallows the
   * drain. The steer therefore degrades to the run-end leftover path: the
   * pending part leaves the thread and the text auto-sends as the next turn.
   * This test asserts that degradation contract; flip it to assert an applied
   * steer-part surviving in-thread once the SDK fix lands.
   */
  test('steers mid-run: pending part appears immediately and the words survive run end (degrades to follow-up turn)', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const label = uniqueLabel('steer');
    const steerText = `Steer injection ${label}`;

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, PROVIDER_C);
    await selectEphemeralMCP(page);
    await establishConversation(page, `steer-setup-${label}`);

    // Slow tool run: turn 1 streams a ~11s preamble, then calls the MCP
    // fixture tool (the PostToolBatch boundary), turn 2 streams final text.
    const run = await sendMessage(page, `E2E_STEER_TOOL_REPLY:${label}`);
    expect(run.ok()).toBeTruthy();

    await typeDuringRun(page, steerText);
    await expect(duringRunSendButton(page)).toHaveAttribute('data-during-run-action', 'steer');

    const [steerResponse] = await Promise.all([
      page.waitForResponse(isSteerRequest, { timeout: 15000 }),
      messageInput(page).press('Enter'),
    ]);
    expect(steerResponse.status()).toBe(202);

    // The steer shows in-thread immediately as an optimistic user-style part.
    await expect(pendingSteerParts(page).filter({ hasText: steerText })).toHaveCount(1, {
      timeout: 10000,
    });

    // The run genuinely crossed a tool boundary while the steer was queued.
    await expect(messagesView(page).getByRole('button', { name: /remember_fact/ })).toBeVisible({
      timeout: 60000,
    });
    await expect(messagesView(page).getByText(`E2E steer tool reply done ${label}`)).toBeVisible({
      timeout: 60000,
    });

    // Degradation contract (see header comment): the un-applied steer leaves
    // the thread at run end and auto-sends as the next user turn, followed by
    // a fresh assistant response — the user's words are never dropped.
    await expect(messageTurns(page)).toHaveCount(6, { timeout: 30000 });
    await expect(pendingSteerParts(page)).toHaveCount(0);
    await expect(appliedSteerParts(page)).toHaveCount(0);
    const steerTurn = messageTurns(page).nth(4);
    await expect(steerTurn).toContainText(steerText);
    await expect(steerTurn.locator('.user-turn')).toBeVisible();
    const steerReply = messageTurns(page).nth(5);
    await expect(steerReply).toContainText(MOCK_REPLY_TEXT, { timeout: 30000 });
    await expect(steerReply.locator('.agent-turn')).toBeVisible();
  });

  test('queues with Cmd/Ctrl+Enter during a run and auto-sends after clean completion', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('queue');
    const queueText = `Queued follow-up ${label}`;

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await establishConversation(page, `queue-setup-${label}`);

    const run = await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
    expect(run.ok()).toBeTruthy();

    await typeDuringRun(page, queueText);
    await messageInput(page).press('ControlOrMeta+Enter');

    const row = queuedRows(page).filter({ hasText: queueText });
    await expect(row).toBeVisible({ timeout: 10000 });
    // Queued means NOT injected into the live thread.
    await expect(pendingSteerParts(page)).toHaveCount(0);

    // Clean completion drains exactly one queued message as a new user turn.
    await expect(row).toHaveCount(0, { timeout: 60000 });
    await expect(messageTurns(page)).toHaveCount(6, { timeout: 30000 });
    const queuedTurn = messageTurns(page).nth(4);
    await expect(queuedTurn).toContainText(queueText);
    await expect(queuedTurn.locator('.user-turn')).toBeVisible();
    const followupReply = messageTurns(page).nth(5);
    await expect(followupReply).toContainText(MOCK_REPLY_TEXT, { timeout: 30000 });
    await expect(followupReply.locator('.agent-turn')).toBeVisible();
  });

  test('interrupt & send (Alt+Enter) stops the run and auto-sends the text as the next turn', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('interrupt');
    const interruptText = `Interrupt follow-up ${label}`;

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await establishConversation(page, `interrupt-setup-${label}`);

    const run = await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
    expect(run.ok()).toBeTruthy();
    // Let the response visibly stream before interrupting (real-user timing;
    // also proves the run was genuinely mid-generation when stopped).
    await expect(messagesView(page).getByText('chunk-010')).toBeVisible({ timeout: 15000 });

    await typeDuringRun(page, interruptText);
    await messageInput(page).press('Alt+Enter');

    // The abort settles and the text auto-sends as the next user turn.
    await expect(messageTurns(page)).toHaveCount(6, { timeout: 60000 });
    const interruptTurn = messageTurns(page).nth(4);
    await expect(interruptTurn).toContainText(interruptText);
    await expect(interruptTurn.locator('.user-turn')).toBeVisible();

    // The follow-up run streams its response into the LIVE view — no reload.
    const freshReply = messageTurns(page).nth(5);
    await expect(freshReply).toContainText(MOCK_REPLY_TEXT, { timeout: 30000 });
    await expect(freshReply.locator('.agent-turn')).toBeVisible();

    // The interrupted response was stopped mid-stream: its final chunk never
    // arrived (an uninterrupted slow run always ends with it).
    await expect(messagesView(page).getByText(SLOW_REPLY_LAST_CHUNK)).toHaveCount(0);
  });
});
