import { expect, test } from '@playwright/test';
import type { Page, Response, Route } from '@playwright/test';
import {
  isAgentGenerationStart,
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

const NO_PARENT = '00000000-0000-0000-0000-000000000000';

type TextContentPart = {
  type?: string;
  text?: string | { value?: string };
  error?: string;
};

type E2EMessage = {
  messageId: string;
  parentMessageId?: string | null;
  conversationId?: string | null;
  text?: string;
  content?: TextContentPart[];
  isCreatedByUser?: boolean;
  error?: boolean;
  unfinished?: boolean;
};

type ForkResponse = {
  conversation: {
    conversationId?: string;
  };
  messages: E2EMessage[];
};

const uniqueLabel = (name: string) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const replyPrompt = (label: string) => `E2E_REPLY:${label}`;
const replyText = (label: string) => `E2E reply ${label}`;
const countedPrompt = (label: string) => `E2E_COUNTED_REPLY:${label}`;
const countedReplyText = (label: string, count: number) => `E2E counted reply ${label} #${count}`;
const slowPrompt = (label: string) => `E2E_SLOW_REPLY:${label}`;
const slowReplyPrefix = (label: string) => `E2E slow reply ${label}`;

const messagesView = (page: Page) => page.getByTestId('messages-view');
const messageRender = (page: Page, text: string) =>
  page.locator('.message-render').filter({ hasText: text }).last();
const conversationPath = (conversationId: string) => `/c/${encodeURIComponent(conversationId)}`;

function contentText(part: TextContentPart): string {
  if (typeof part.text === 'string') {
    return part.text;
  }
  if (part.text?.value) {
    return part.text.value;
  }
  return part.error ?? '';
}

function messageText(message: E2EMessage): string {
  if (message.text) {
    return message.text;
  }
  return message.content?.map(contentText).filter(Boolean).join('\n') ?? '';
}

function findMessage(messages: E2EMessage[], text: string, isCreatedByUser?: boolean): E2EMessage {
  const message = messages.find((candidate) => {
    const roleMatches =
      isCreatedByUser === undefined || candidate.isCreatedByUser === isCreatedByUser;
    return roleMatches && messageText(candidate).includes(text);
  });
  if (!message) {
    throw new Error(
      `Expected message containing "${text}". Saw:\n${messages.map(messageText).join('\n---\n')}`,
    );
  }
  return message;
}

function expectParent(
  messages: E2EMessage[],
  childText: string,
  parentText: string,
  childIsUser?: boolean,
) {
  const child = findMessage(messages, childText, childIsUser);
  const parent = findMessage(messages, parentText);
  expect(child.parentMessageId, `${childText} should be a child of ${parentText}`).toBe(
    parent.messageId,
  );
}

function expectNoFoldedMessages(messages: E2EMessage[]) {
  const ids = new Set(messages.map((message) => message.messageId));
  const folded = messages.filter((message) => {
    const parentId = message.parentMessageId;
    return parentId != null && parentId !== '' && parentId !== NO_PARENT && !ids.has(parentId);
  });
  expect(
    folded.map((message) => ({
      text: messageText(message),
      messageId: message.messageId,
      parentMessageId: message.parentMessageId,
    })),
    'messages must not render as parent-less folded children',
  ).toEqual([]);

  const roots = messages.filter((message) => {
    const parentId = message.parentMessageId;
    return parentId == null || parentId === '' || parentId === NO_PARENT;
  });
  expect(
    roots.map((message) => ({
      text: messageText(message),
      isCreatedByUser: message.isCreatedByUser,
    })),
    'only user messages should be roots',
  ).toEqual(roots.map(() => expect.objectContaining({ isCreatedByUser: true })));
}

async function expectVisibleMessages(page: Page, texts: string[]) {
  for (const text of texts) {
    await expect(messagesView(page).getByText(text)).toBeVisible({ timeout: 30000 });
  }
}

async function reloadAndExpectMessages(page: Page, texts: string[]) {
  await page.reload({ timeout: 10000 });
  await expectVisibleMessages(page, texts);
}

async function revisitConversationAndExpectMessages(
  page: Page,
  conversationId: string,
  texts: string[],
) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await page.goto(conversationPath(conversationId), { timeout: 10000 });
  await expectVisibleMessages(page, texts);
}

async function mockActiveOAuthResumeStream({
  page,
  authUrl,
  conversationId,
  parentMessageId,
  pendingPrompt,
  pendingUserMessageId,
}: {
  page: Page;
  authUrl: string;
  conversationId: string;
  parentMessageId: string;
  pendingPrompt: string;
  pendingUserMessageId: string;
}) {
  const pendingResponseMessageId = `${pendingUserMessageId}_`;
  const toolCallId = `${pendingUserMessageId}:Google-Workspace`;
  const stepId = 'step_oauth_login_Google-Workspace';
  const resumeState = {
    runSteps: [],
    aggregatedContent: [],
    responseMessageId: pendingResponseMessageId,
    conversationId,
    userMessage: {
      messageId: pendingUserMessageId,
      parentMessageId,
      conversationId,
      text: pendingPrompt,
    },
    replayEvents: [
      {
        event: 'on_run_step',
        data: {
          runId: 'USE_PRELIM_RESPONSE_MESSAGE_ID',
          id: stepId,
          type: 'tool_calls',
          index: 0,
          stepDetails: {
            type: 'tool_calls',
            tool_calls: [
              {
                id: toolCallId,
                name: 'oauth_mcp_Google-Workspace',
                type: 'tool_call_chunk',
              },
            ],
          },
        },
      },
      {
        event: 'on_run_step_delta',
        data: {
          id: stepId,
          delta: {
            type: 'tool_calls',
            tool_calls: [
              {
                id: toolCallId,
                name: 'oauth_mcp_Google-Workspace',
                type: 'tool_call_chunk',
                args: '',
              },
            ],
            auth: authUrl,
            expires_at: Date.now() + 120000,
          },
        },
      },
    ],
  };

  await page.route(`**/api/agents/chat/status/${conversationId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        active: true,
        streamId: conversationId,
        status: 'running',
        aggregatedContent: [],
        createdAt: Date.now(),
        resumeState,
      }),
    }),
  );

  await page.route(`**/api/agents/chat/stream/${conversationId}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `event: message\ndata: ${JSON.stringify({
        sync: true,
        resumeState,
        pendingEvents: [],
      })}\n\n`,
    }),
  );
}

async function openMockChat(page: Page) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
}

function isAgentGenerationResponse(response: Response, expectedStatus: number) {
  const { pathname } = new URL(response.url());
  const isAgentsChat = pathname === '/api/agents/chat' || pathname.startsWith('/api/agents/chat/');
  return (
    response.request().method() === 'POST' &&
    isAgentsChat &&
    !pathname.endsWith('/abort') &&
    response.status() === expectedStatus
  );
}

async function waitForGenerationStart(page: Page, action: () => Promise<void>): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse(isAgentGenerationStart, { timeout: 30000 }),
    action(),
  ]);
  expect(response.ok()).toBeTruthy();
  return response;
}

async function sendAndExpectReply(page: Page, prompt: string, expectedReply: string) {
  const response = await sendMessage(page, prompt);
  expect(response.ok()).toBeTruthy();
  await expect(messagesView(page).getByText(expectedReply)).toBeVisible({ timeout: 30000 });
}

async function submitMessageExpectingGenerationFailure(
  page: Page,
  prompt: string,
  expectedStatus: number,
) {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await expect(input).toBeEnabled({ timeout: 30000 });
  await input.click();
  await input.fill(prompt);
  const [response] = await Promise.all([
    page.waitForResponse((res) => isAgentGenerationResponse(res, expectedStatus), {
      timeout: 30000,
    }),
    input.press('Enter'),
  ]);
  return response;
}

async function conversationIdFromPage(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/c\/(?!new)[0-9a-fA-F-]{36}$/);
  const id = new URL(page.url()).pathname.split('/').pop();
  if (!id) {
    throw new Error(`Could not parse conversation id from ${page.url()}`);
  }
  return id;
}

async function fetchMessages(
  page: Page,
  conversationId: string,
  accessToken?: string,
): Promise<E2EMessage[]> {
  const token = accessToken ?? (await getAccessToken(page));
  return fetchJson<E2EMessage[]>(
    page,
    `/api/messages/${encodeURIComponent(conversationId)}`,
    token,
  );
}

async function waitForMessages(
  page: Page,
  conversationId: string,
  predicate: (messages: E2EMessage[]) => boolean,
  description: string,
): Promise<E2EMessage[]> {
  let latest: E2EMessage[] = [];
  const token = await getAccessToken(page);
  for (let attempt = 0; attempt < 80; attempt++) {
    latest = await fetchMessages(page, conversationId, token);
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for ${description}. Latest messages:\n${latest
      .map(
        (message) => `${message.messageId} <- ${message.parentMessageId}: ${messageText(message)}`,
      )
      .join('\n')}`,
  );
}

async function clickMessageTitleButton(page: Page, messageTextValue: string, title: string) {
  const render = messageRender(page, messageTextValue);
  await render.scrollIntoViewIfNeeded();
  await render.hover();
  await render.locator(`button[title="${title}"]`).last().click();
}

async function clickSibling(page: Page, messageTextValue: string, direction: 'Previous' | 'Next') {
  const render = messageRender(page, messageTextValue);
  await render.scrollIntoViewIfNeeded();
  await render.hover();
  await render.getByRole('button', { name: `${direction} sibling message` }).click();
}

async function expectCanCycleSiblingTexts(page: Page, previousText: string, nextText: string) {
  const previous = messagesView(page).getByText(previousText);
  const next = messagesView(page).getByText(nextText);
  if (await previous.isVisible()) {
    await clickSibling(page, previousText, 'Next');
    await expect(next).toBeVisible();
    await clickSibling(page, nextText, 'Previous');
    await expect(previous).toBeVisible();
    return;
  }

  if (await next.isVisible()) {
    await clickSibling(page, nextText, 'Previous');
    await expect(previous).toBeVisible();
    await clickSibling(page, previousText, 'Next');
    await expect(next).toBeVisible();
    return;
  }

  throw new Error(`Expected either sibling "${previousText}" or "${nextText}" to be visible`);
}

async function clickForkVisibleMessages(
  page: Page,
  messageTextValue: string,
): Promise<ForkResponse> {
  const render = messageRender(page, messageTextValue);
  await render.scrollIntoViewIfNeeded();
  await render.hover();
  await render.getByRole('button', { name: 'Open Fork Menu' }).click();

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/convos/fork') &&
        res.status() === 200,
      { timeout: 30000 },
    ),
    page.getByRole('button', { name: 'Visible messages only', exact: true }).click(),
  ]);

  return (await response.json()) as ForkResponse;
}

test.describe('message tree stream operations', () => {
  test.setTimeout(180000);

  test('streams follow-ups and keeps an aborted response as the next parent', async ({ page }) => {
    const label = uniqueLabel('abort');
    const firstPrompt = replyPrompt(`${label}-first`);
    const firstReply = replyText(`${label}-first`);
    const secondPrompt = replyPrompt(`${label}-second`);
    const secondReply = replyText(`${label}-second`);
    const abortPrompt = slowPrompt(`${label}-stop`);
    const abortReply = slowReplyPrefix(`${label}-stop`);
    const afterAbortPrompt = replyPrompt(`${label}-after-stop`);
    const afterAbortReply = replyText(`${label}-after-stop`);

    await openMockChat(page);
    await sendAndExpectReply(page, firstPrompt, firstReply);
    const conversationId = await conversationIdFromPage(page);
    await sendAndExpectReply(page, secondPrompt, secondReply);

    const slowStart = await sendMessage(page, abortPrompt);
    expect(slowStart.ok()).toBeTruthy();
    await expect(messagesView(page).getByText(abortReply)).toBeVisible({ timeout: 30000 });

    const [abortResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/agents/chat/abort'),
        { timeout: 30000 },
      ),
      page.getByRole('button', { name: 'Stop generating' }).click(),
    ]);
    expect(abortResponse.ok()).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
      timeout: 30000,
    });

    let messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(abortReply)),
      'aborted response to persist',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, secondPrompt, firstReply, true);
    expectParent(messages, abortReply, abortPrompt, false);

    await sendAndExpectReply(page, afterAbortPrompt, afterAbortReply);
    messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(afterAbortReply)),
      'follow-up after abort',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, afterAbortPrompt, abortReply, true);
    expectParent(messages, afterAbortReply, afterAbortPrompt, false);

    await reloadAndExpectMessages(page, [firstReply, secondReply, abortReply, afterAbortReply]);
    await revisitConversationAndExpectMessages(page, conversationId, [
      firstReply,
      secondReply,
      abortReply,
      afterAbortReply,
    ]);
  });

  test('regenerates assistant siblings, cycles branches, follows up, and forks the visible branch', async ({
    page,
  }) => {
    const label = uniqueLabel('regen');
    const prompt = countedPrompt(label);
    const firstReply = countedReplyText(label, 1);
    const regeneratedReply = countedReplyText(label, 2);
    const followPrompt = replyPrompt(`${label}-follow`);
    const followReply = replyText(`${label}-follow`);

    await openMockChat(page);
    await sendAndExpectReply(page, prompt, firstReply);
    const originalConversationId = await conversationIdFromPage(page);

    await waitForGenerationStart(page, () =>
      clickMessageTitleButton(page, firstReply, 'Regenerate'),
    );
    await expect(messagesView(page).getByText(regeneratedReply)).toBeVisible({ timeout: 30000 });

    await clickSibling(page, regeneratedReply, 'Previous');
    await expect(messagesView(page).getByText(firstReply)).toBeVisible();
    await expect(messagesView(page).getByText(regeneratedReply)).toBeHidden();
    await clickSibling(page, firstReply, 'Next');
    await expect(messagesView(page).getByText(regeneratedReply)).toBeVisible();

    await sendAndExpectReply(page, followPrompt, followReply);
    let messages = await waitForMessages(
      page,
      originalConversationId,
      (items) => items.some((message) => messageText(message).includes(followReply)),
      'follow-up after regenerate',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, firstReply, prompt, false);
    expectParent(messages, regeneratedReply, prompt, false);
    expectParent(messages, followPrompt, regeneratedReply, true);
    expectParent(messages, followReply, followPrompt, false);

    const userMessage = findMessage(messages, prompt, true);
    const assistantSiblings = messages.filter(
      (message) => message.parentMessageId === userMessage.messageId && !message.isCreatedByUser,
    );
    expect(assistantSiblings.map(messageText).sort()).toEqual(
      [firstReply, regeneratedReply].sort(),
    );

    await reloadAndExpectMessages(page, [regeneratedReply, followReply]);
    await revisitConversationAndExpectMessages(page, originalConversationId, [
      regeneratedReply,
      followReply,
    ]);
    await clickSibling(page, regeneratedReply, 'Previous');
    await expect(messagesView(page).getByText(firstReply)).toBeVisible();
    const fork = await clickForkVisibleMessages(page, firstReply);
    const forkedConversationId = fork.conversation.conversationId;
    if (!forkedConversationId) {
      throw new Error('Expected fork response to include a conversation id');
    }
    await expect(page).toHaveURL(new RegExp(`/c/${forkedConversationId}$`));

    messages = fork.messages;
    expectNoFoldedMessages(messages);
    expect(messages.some((message) => messageText(message).includes(firstReply))).toBe(true);
    expect(messages.some((message) => messageText(message).includes(regeneratedReply))).toBe(false);
    expect(messages.some((message) => messageText(message).includes(followReply))).toBe(false);
  });

  test('resumes pending OAuth on the selected older branch after reload', async ({ page }) => {
    const label = uniqueLabel('oauth-branch');
    const rootPrompt = countedPrompt(`${label}-root`);
    const firstReply = countedReplyText(`${label}-root`, 1);
    const regeneratedReply = countedReplyText(`${label}-root`, 2);
    const followPrompt = replyPrompt(`${label}-follow`);
    const followReply = replyText(`${label}-follow`);
    const pendingPrompt = replyPrompt(`${label}-oauth`);

    await openMockChat(page);
    await sendAndExpectReply(page, rootPrompt, firstReply);
    const conversationId = await conversationIdFromPage(page);
    await sendAndExpectReply(page, followPrompt, followReply);

    await waitForGenerationStart(page, () =>
      clickMessageTitleButton(page, firstReply, 'Regenerate'),
    );
    await expect(messagesView(page).getByText(regeneratedReply)).toBeVisible({ timeout: 30000 });

    await clickSibling(page, regeneratedReply, 'Previous');
    await expectVisibleMessages(page, [firstReply, followPrompt, followReply]);
    await expect(messagesView(page).getByText(regeneratedReply)).toBeHidden();

    const messages = await waitForMessages(
      page,
      conversationId,
      (items) =>
        items.some((message) => messageText(message).includes(followReply)) &&
        items.some((message) => messageText(message).includes(regeneratedReply)),
      'two-branch conversation',
    );
    const branchOneTail = findMessage(messages, followReply, false);

    await mockActiveOAuthResumeStream({
      page,
      conversationId,
      parentMessageId: branchOneTail.messageId,
      pendingPrompt,
      pendingUserMessageId: `${label}-pending-user`,
      authUrl: `https://auth.example.test/${label}`,
    });

    await page.reload({ timeout: 10000 });
    await expectVisibleMessages(page, [firstReply, followPrompt, followReply, pendingPrompt]);
    await expect(messagesView(page).getByText(regeneratedReply)).toBeHidden();
  });

  test('long threads retain regenerated and save-and-submit branches after revisit', async ({
    page,
  }) => {
    const label = uniqueLabel('save-submit');
    const rootPrompt = replyPrompt(`${label}-root`);
    const rootReply = replyText(`${label}-root`);
    const firstPrompt = replyPrompt(`${label}-first`);
    const firstReply = replyText(`${label}-first`);
    const middlePrompt = replyPrompt(`${label}-middle`);
    const middleReply = replyText(`${label}-middle`);
    const fourthPrompt = replyPrompt(`${label}-fourth`);
    const fourthReply = replyText(`${label}-fourth`);
    const tailPrompt = countedPrompt(`${label}-tail`);
    const tailReply = countedReplyText(`${label}-tail`, 1);
    const regeneratedTailReply = countedReplyText(`${label}-tail`, 2);
    const editedMiddlePrompt = replyPrompt(`${label}-middle-edited`);
    const editedMiddleReply = replyText(`${label}-middle-edited`);
    const afterEditPrompt = replyPrompt(`${label}-after-edit`);
    const afterEditReply = replyText(`${label}-after-edit`);

    await openMockChat(page);
    await sendAndExpectReply(page, rootPrompt, rootReply);
    const conversationId = await conversationIdFromPage(page);
    await sendAndExpectReply(page, firstPrompt, firstReply);
    await sendAndExpectReply(page, middlePrompt, middleReply);
    await sendAndExpectReply(page, fourthPrompt, fourthReply);
    await sendAndExpectReply(page, tailPrompt, tailReply);

    await waitForGenerationStart(page, () =>
      clickMessageTitleButton(page, tailReply, 'Regenerate'),
    );
    await expect(messagesView(page).getByText(regeneratedTailReply)).toBeVisible({
      timeout: 30000,
    });

    await clickMessageTitleButton(page, middlePrompt, 'Edit');
    const editor = page.getByTestId('message-text-editor');
    await expect(editor).toBeVisible();
    await editor.fill(editedMiddlePrompt);
    await waitForGenerationStart(page, () =>
      page.getByRole('button', { name: 'Save & Submit' }).click(),
    );
    await expect(messagesView(page).getByText(editedMiddleReply)).toBeVisible({ timeout: 30000 });

    let messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(editedMiddleReply)),
      'save-and-submit edited branch',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, firstPrompt, rootReply, true);
    expectParent(messages, firstReply, firstPrompt, false);
    expectParent(messages, middlePrompt, firstReply, true);
    expectParent(messages, middleReply, middlePrompt, false);
    expectParent(messages, fourthPrompt, middleReply, true);
    expectParent(messages, fourthReply, fourthPrompt, false);
    expectParent(messages, tailPrompt, fourthReply, true);
    expectParent(messages, tailReply, tailPrompt, false);
    expectParent(messages, regeneratedTailReply, tailPrompt, false);
    expectParent(messages, editedMiddlePrompt, firstReply, true);
    expectParent(messages, editedMiddleReply, editedMiddlePrompt, false);

    await clickSibling(page, editedMiddlePrompt, 'Previous');
    await expectVisibleMessages(page, [middlePrompt, fourthReply]);
    await expectCanCycleSiblingTexts(page, tailReply, regeneratedTailReply);
    await clickSibling(page, middlePrompt, 'Next');
    await expectVisibleMessages(page, [editedMiddlePrompt, editedMiddleReply]);

    await sendAndExpectReply(page, afterEditPrompt, afterEditReply);
    messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(afterEditReply)),
      'follow-up after save-and-submit branch',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, afterEditPrompt, editedMiddleReply, true);
    expectParent(messages, afterEditReply, afterEditPrompt, false);
    expect(messages.some((message) => messageText(message).includes(tailReply))).toBe(true);
    expect(messages.some((message) => messageText(message).includes(regeneratedTailReply))).toBe(
      true,
    );

    await reloadAndExpectMessages(page, [rootReply, firstReply, editedMiddleReply, afterEditReply]);
    await revisitConversationAndExpectMessages(page, conversationId, [
      rootReply,
      firstReply,
      editedMiddleReply,
      afterEditReply,
    ]);
    await clickSibling(page, editedMiddlePrompt, 'Previous');
    await expectVisibleMessages(page, [middlePrompt, fourthReply]);
    await expectCanCycleSiblingTexts(page, tailReply, regeneratedTailReply);
    await clickSibling(page, middlePrompt, 'Next');
    await expectVisibleMessages(page, [editedMiddlePrompt, editedMiddleReply, afterEditReply]);
  });

  test('error responses remain valid parents for follow-ups', async ({ page }) => {
    const label = uniqueLabel('error');
    const basePrompt = replyPrompt(`${label}-base`);
    const baseReply = replyText(`${label}-base`);
    const errorPrompt = `E2E_FORCED_ERROR:${label}`;
    const errorText = `E2E forced stream error ${label}`;
    const afterErrorPrompt = replyPrompt(`${label}-after-error`);
    const afterErrorReply = replyText(`${label}-after-error`);

    await openMockChat(page);
    await sendAndExpectReply(page, basePrompt, baseReply);
    const conversationId = await conversationIdFromPage(page);

    await sendAndExpectReply(page, errorPrompt, errorText);
    await expect(messagesView(page).getByText(errorText)).toBeVisible({ timeout: 30000 });

    await sendAndExpectReply(page, afterErrorPrompt, afterErrorReply);
    const messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(afterErrorReply)),
      'follow-up after error',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, errorPrompt, baseReply, true);
    expectParent(messages, errorText, errorPrompt, false);
    expectParent(messages, afterErrorPrompt, errorText, true);
    expectParent(messages, afterErrorReply, afterErrorPrompt, false);

    await reloadAndExpectMessages(page, [baseReply, errorText, afterErrorReply]);
    await revisitConversationAndExpectMessages(page, conversationId, [
      baseReply,
      errorText,
      afterErrorReply,
    ]);
  });

  test('generation-start failures recover without folding the next follow-up', async ({ page }) => {
    const label = uniqueLabel('start-error');
    const basePrompt = replyPrompt(`${label}-base`);
    const baseReply = replyText(`${label}-base`);
    const failedPrompt = replyPrompt(`${label}-failed-start`);
    const failedText = `E2E generation start failure ${label}`;
    const afterFailurePrompt = replyPrompt(`${label}-after-start-failure`);
    const afterFailureReply = replyText(`${label}-after-start-failure`);

    await openMockChat(page);
    await sendAndExpectReply(page, basePrompt, baseReply);
    const conversationId = await conversationIdFromPage(page);

    const failGenerationStart = async (route: Route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const isAgentsChat =
        pathname === '/api/agents/chat' || pathname.startsWith('/api/agents/chat/');
      if (
        request.method() !== 'POST' ||
        !isAgentsChat ||
        pathname.endsWith('/abort') ||
        !request.postData()?.includes(failedPrompt)
      ) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: failedText }),
      });
    };
    await page.route('**/api/agents/chat**', failGenerationStart);

    const failure = await submitMessageExpectingGenerationFailure(page, failedPrompt, 500);
    expect(failure.ok()).toBe(false);
    await expect(messagesView(page).getByText(failedText)).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeEnabled({
      timeout: 30000,
    });
    await page.unroute('**/api/agents/chat**', failGenerationStart);

    await sendAndExpectReply(page, afterFailurePrompt, afterFailureReply);
    const messages = await waitForMessages(
      page,
      conversationId,
      (items) => items.some((message) => messageText(message).includes(afterFailureReply)),
      'follow-up after generation-start failure',
    );
    expectNoFoldedMessages(messages);
    expectParent(messages, afterFailurePrompt, baseReply, true);
    expectParent(messages, afterFailureReply, afterFailurePrompt, false);
    expect(messages.some((message) => messageText(message).includes(failedPrompt))).toBe(false);
    expect(messages.some((message) => messageText(message).includes(failedText))).toBe(false);

    await reloadAndExpectMessages(page, [baseReply, afterFailureReply]);
    await expect(messagesView(page).getByText(failedText)).toBeHidden();
    await revisitConversationAndExpectMessages(page, conversationId, [
      baseReply,
      afterFailureReply,
    ]);
    await expect(messagesView(page).getByText(failedText)).toBeHidden();
  });
});
