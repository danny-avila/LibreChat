import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import { cleanupAgent, openAgentBuilder, uniqueAgentName } from '../agents.helpers';
import {
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  requestJson,
  sendMessageAndWaitForCompletion,
} from '../helpers';
import { deleteConversations, deleteMessagesByConversation } from '../db';

const OPENAI_PROVIDER = 'openAI';
const OPENAI_MODEL = 'gpt-5.6';
const CUSTOM_PROVIDER = 'Mock Provider A';
const CUSTOM_MODEL = 'mock-model-a';
const PROMPT_CACHE_MARKER = 'E2E_ASSERT_PROMPT_CACHE:';

const createdAgentIds: string[] = [];
const cleanupConversationIds: string[] = [];

type CreatedAgent = {
  id: string;
  name: string;
};

async function createAgent(
  page: Page,
  token: string,
  provider: string,
  model: string,
  instructions: string,
): Promise<CreatedAgent> {
  const name = uniqueAgentName('E2E Prompt Cache Agent');
  const agent = await requestJson<CreatedAgent>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: {
      name,
      description: 'Prompt cache key scenario fixture.',
      instructions,
      provider,
      model,
      model_parameters: {},
    },
  });
  createdAgentIds.push(agent.id);
  return agent;
}

async function selectAgent(page: Page, agentName: string) {
  const form = await openAgentBuilder(page);
  await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
  await page.getByRole('option', { name: agentName, exact: true }).click();
  await expect(form.getByLabel('Agent name')).toHaveValue(agentName);
  await form.getByRole('button', { name: 'Select Agent' }).click();
}

function persistedText(message: TMessage): string {
  if (message.text) {
    return message.text;
  }
  return (message.content ?? [])
    .map((part) => {
      if (part?.type !== 'text') {
        return '';
      }
      const text = (part as { text?: string | { value?: string } }).text;
      return typeof text === 'string' ? text : (text?.value ?? '');
    })
    .join('');
}

async function sendAssertion(page: Page, agentName: string, distinctText: string): Promise<string> {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectAgent(page, agentName);
  const response = await sendMessageAndWaitForCompletion(
    page,
    `${PROMPT_CACHE_MARKER}${distinctText}\n${distinctText}`,
    { timeout: 60000 },
  );
  expect(response.ok()).toBeTruthy();

  const conversationId = /\/c\/([^/]+)/.exec(page.url())?.[1];
  expect(conversationId, 'conversation should have a persisted id').toBeTruthy();
  cleanupConversationIds.push(conversationId as string);

  const token = await getAccessToken(page);
  const messages = await fetchJson<TMessage[]>(
    page,
    `/api/messages/${encodeURIComponent(conversationId as string)}`,
    token,
  );
  const assistantText = messages
    .filter((message) => message.isCreatedByUser === false)
    .map(persistedText)
    .join('\n');
  const key = /PROMPT_CACHE_KEY=([^\r\n]*)/.exec(assistantText)?.[1];
  expect(key, 'assistant reply should report a prompt cache key').toBeDefined();
  return key as string;
}

test.afterEach(async ({ page }) => {
  const conversationIds = cleanupConversationIds.splice(0);
  if (conversationIds.length > 0) {
    try {
      await deleteMessagesByConversation(conversationIds);
    } finally {
      await deleteConversations(conversationIds);
    }
  }

  const agentIds = createdAgentIds.splice(0).reverse();
  await Promise.all(agentIds.map((agentId) => cleanupAgent(page, agentId)));
});

test.describe('prompt cache key', () => {
  test('shares one cache key for a stable agent prefix across conversations @scenario:stable-prefix-shares-one-cache-key-across-conversations', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    const token = await getAccessToken(page);
    const instructions = 'Always answer this deterministic prompt-cache scenario briefly.';
    const agent = await createAgent(page, token, OPENAI_PROVIDER, OPENAI_MODEL, instructions);

    const firstKey = await sendAssertion(page, agent.name, 'first distinct user message');
    const secondKey = await sendAssertion(page, agent.name, 'second distinct user message');
    expect(firstKey).not.toBe('');
    expect(firstKey).not.toBe('none');
    expect(secondKey).not.toBe('');
    expect(secondKey).not.toBe('none');
    expect(secondKey).toBe(firstKey);
  });

  test('retires the cache key when agent instructions change @scenario:changed-agent-instructions-retire-the-cache-key', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    const token = await getAccessToken(page);
    const initialInstructions = 'Use the initial stable instructions for this cache scenario.';
    const agent = await createAgent(page, token, OPENAI_PROVIDER, OPENAI_MODEL, initialInstructions);

    const firstKey = await sendAssertion(page, agent.name, 'before instruction change');
    expect(firstKey).not.toBe('');
    expect(firstKey).not.toBe('none');

    await requestJson(page, {
      path: `/api/agents/${encodeURIComponent(agent.id)}`,
      token,
      method: 'PATCH',
      body: { instructions: 'Use materially different instructions after the update.' },
    });

    const secondKey = await sendAssertion(page, agent.name, 'after instruction change');
    expect(secondKey).not.toBe('');
    expect(secondKey).not.toBe('none');
    expect(secondKey).not.toBe(firstKey);
  });

  test('sends no cache key for a gateway endpoint @scenario:gateway-endpoint-sends-no-cache-key', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    const token = await getAccessToken(page);
    const agent = await createAgent(
      page,
      token,
      CUSTOM_PROVIDER,
      CUSTOM_MODEL,
      'Use the custom gateway endpoint for this scenario.',
    );

    const key = await sendAssertion(page, agent.name, 'custom gateway request');
    expect(key).toBe('none');
  });
});
