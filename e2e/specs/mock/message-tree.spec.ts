import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
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

async function openMockChat(page: Page) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
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
  test.describe.configure({ timeout: 120000 });

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

    await page.reload({ timeout: 10000 });
    await expect(messagesView(page).getByText(firstReply)).toBeVisible({ timeout: 30000 });
    await expect(messagesView(page).getByText(secondReply)).toBeVisible();
    await expect(messagesView(page).getByText(abortReply)).toBeVisible();
    await expect(messagesView(page).getByText(afterAbortReply)).toBeVisible();
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

  test('save-and-submit from the middle of a long thread retains and cycles both branches', async ({
    page,
  }) => {
    const label = uniqueLabel('save-submit');
    const rootPrompt = replyPrompt(`${label}-root`);
    const rootReply = replyText(`${label}-root`);
    const middlePrompt = replyPrompt(`${label}-middle`);
    const middleReply = replyText(`${label}-middle`);
    const tailPrompt = replyPrompt(`${label}-tail`);
    const tailReply = replyText(`${label}-tail`);
    const editedMiddlePrompt = replyPrompt(`${label}-middle-edited`);
    const editedMiddleReply = replyText(`${label}-middle-edited`);
    const afterEditPrompt = replyPrompt(`${label}-after-edit`);
    const afterEditReply = replyText(`${label}-after-edit`);

    await openMockChat(page);
    await sendAndExpectReply(page, rootPrompt, rootReply);
    const conversationId = await conversationIdFromPage(page);
    await sendAndExpectReply(page, middlePrompt, middleReply);
    await sendAndExpectReply(page, tailPrompt, tailReply);

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
    expectParent(messages, middlePrompt, rootReply, true);
    expectParent(messages, middleReply, middlePrompt, false);
    expectParent(messages, tailPrompt, middleReply, true);
    expectParent(messages, tailReply, tailPrompt, false);
    expectParent(messages, editedMiddlePrompt, rootReply, true);
    expectParent(messages, editedMiddleReply, editedMiddlePrompt, false);

    await clickSibling(page, editedMiddlePrompt, 'Previous');
    await expect(messagesView(page).getByText(middlePrompt)).toBeVisible();
    await expect(messagesView(page).getByText(tailReply)).toBeVisible();
    await clickSibling(page, middlePrompt, 'Next');
    await expect(messagesView(page).getByText(editedMiddlePrompt)).toBeVisible();
    await expect(messagesView(page).getByText(editedMiddleReply)).toBeVisible();

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
  });
});
