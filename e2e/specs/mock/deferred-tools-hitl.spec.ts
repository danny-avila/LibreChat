import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import type { AgentDetail } from './agents.helpers';
import { cleanupAgent, openAgentBuilder, uniqueAgentName } from './agents.helpers';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  escapeRegExp,
  fetchJson,
  getAccessToken,
  messagesView,
  requestJson,
  sendMessage,
} from './helpers';

const MCP_SERVER_NAME = 'e2e-memory';
const MCP_SERVER_TOOL_ID = `sys__server__sys_mcp_${MCP_SERVER_NAME}`;
const DEFERRED_TOOL_ID = `slow_echo_mcp_${MCP_SERVER_NAME}`;
const ASK_USER_QUESTION_TOOL_ID = 'ask_user_question';
const PROMPT_MARKER = 'E2E_DEFERRED_HITL:';
const DESCRIPTION =
  'Verifies deferred-tool discovery survives an ask_user_question pause and resume.';

type MCPToolsResponse = {
  servers?: Record<string, { tools?: Array<{ pluginKey: string }> }>;
};

type AskResumeBody = {
  actionId?: string;
  agent_id?: string;
  answer?: string;
  conversationId?: string;
  endpoint?: string;
};

function isResumeRequest(request: Request) {
  return (
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/agents/chat/resume'
  );
}

async function waitForDeferredTool(page: Page) {
  const token = await getAccessToken(page);
  let latestTools: MCPToolsResponse | null = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    latestTools = await fetchJson<MCPToolsResponse>(page, '/api/mcp/tools', token);
    const tools = latestTools.servers?.[MCP_SERVER_NAME]?.tools ?? [];
    if (tools.some((tool) => tool.pluginKey === DEFERRED_TOOL_ID)) {
      return;
    }
    await page.waitForTimeout(500);
  }

  expect(
    latestTools?.servers?.[MCP_SERVER_NAME]?.tools,
    `Expected ${MCP_SERVER_NAME} to expose ${DEFERRED_TOOL_ID}`,
  ).toEqual(expect.arrayContaining([expect.objectContaining({ pluginKey: DEFERRED_TOOL_ID })]));
}

async function createAndSelectAgent(page: Page): Promise<string> {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await waitForDeferredTool(page);

  const token = await getAccessToken(page);
  const agentName = uniqueAgentName('E2E Deferred HITL Agent');
  const agent = await requestJson<AgentDetail>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: {
      name: agentName,
      description: DESCRIPTION,
      instructions: 'Discover the requested tool, ask the user, then run the discovered tool.',
      provider: MOCK_ENDPOINTS[0].label,
      model: MOCK_ENDPOINTS[0].model,
      tools: [MCP_SERVER_TOOL_ID, DEFERRED_TOOL_ID, ASK_USER_QUESTION_TOOL_ID],
      tool_options: { [DEFERRED_TOOL_ID]: { defer_loading: true } },
    },
  });
  expect(agent.tools).toEqual(
    expect.arrayContaining([DEFERRED_TOOL_ID, ASK_USER_QUESTION_TOOL_ID]),
  );

  const form = await openAgentBuilder(page);
  await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
  await page.getByRole('option', { name: agentName }).click();
  await expect(form.getByLabel('Agent name')).toHaveValue(agentName);
  await form.getByRole('button', { name: 'Select Agent' }).click();
  return agent.id;
}

test.describe('deferred tools across HITL resume', () => {
  test('keeps a discovered tool provider-bound after ask_user_question resumes', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const label = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const question = `Continue deferred schema check ${label}?`;
    const optionLabel = `Continue ${label}`;
    const answer = `continue-${label}`;
    let agentId: string | undefined;

    try {
      agentId = await createAndSelectAgent(page);

      const response = await sendMessage(page, `${PROMPT_MARKER}${label}`);
      expect(response.ok()).toBeTruthy();
      await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
      await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 30000 });

      /** Reload the public conversation route while the graph is paused. This
       * proves the browser reconstructs the real persisted pending action,
       * rather than resuming from transient state held by the original page. */
      const conversationPath = new URL(page.url()).pathname;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(conversationPath);
      await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 30000 });

      const option = page.getByRole('button', {
        name: new RegExp(`${escapeRegExp(optionLabel)}$`),
      });
      await expect(option).toBeVisible();
      const [resumeRequest, resumeResponse] = await Promise.all([
        page.waitForRequest(isResumeRequest),
        page.waitForResponse(
          (candidate) => isResumeRequest(candidate.request()) && candidate.status() === 200,
        ),
        option.click(),
      ]);

      const conversationId = conversationPath.replace('/c/', '');
      const body = resumeRequest.postDataJSON() as AskResumeBody;
      expect(body.actionId).toBeTruthy();
      expect(body.agent_id).toBe(agentId);
      expect(body.answer).toBe(answer);
      expect(body.conversationId).toBe(conversationId);
      expect(body.endpoint).toBe('agents');
      expect(resumeResponse.ok()).toBeTruthy();

      /** The fake provider checks the deferred tool's full JSON schema after
       * tool_search and checks it again in the first model call after resume.
       * It only invokes the real MCP slow_echo tool if both checks pass. */
      const expectedFinal =
        `E2E deferred HITL passed ${label}: ` + `E2E slow echo: resume-${label}`;
      const terminal = messagesView(page).getByText(
        new RegExp(`^E2E deferred HITL (?:passed|failed) ${escapeRegExp(label)}:`),
      );
      await expect(terminal).toBeVisible({ timeout: 30000 });
      expect(await terminal.textContent()).toBe(expectedFinal);
    } finally {
      await cleanupAgent(page, agentId);
    }
  });
});
