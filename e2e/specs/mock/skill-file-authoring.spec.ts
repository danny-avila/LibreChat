import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  enableSkills,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

const FINAL_TEXT = 'E2E file authoring complete';
const EDIT_FINAL_TEXT = 'E2E file edit complete';
const DESCRIPTION =
  'Use this skill to verify LibreChat skill file authoring in mock end-to-end tests.';
const EDITED_DESCRIPTION =
  'Use this edited skill to verify LibreChat skill file authoring in mock end-to-end tests.';

type SkillSummary = {
  _id: string;
  name: string;
  description: string;
};

type SkillDetail = SkillSummary & {
  body: string;
};

type RefreshTokenBody = {
  token?: string;
};

const uniqueSkillName = () => `e2e-file-authoring-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

async function getAccessToken(page: Page): Promise<string> {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, text, json };
  });

  if (!result.ok) {
    throw new Error(
      `Expected /api/auth/refresh to return 2xx, got ${result.status}: ${result.text}`,
    );
  }

  const body = result.json as RefreshTokenBody | null;
  if (!body?.token) {
    throw new Error(`Expected /api/auth/refresh to return a token, got: ${result.text}`);
  }

  return body.token;
}

async function fetchJson<T>(page: Page, path: string, token: string): Promise<T> {
  const result = await page.evaluate(
    async ({ accessToken, urlPath }) => {
      const response = await fetch(urlPath, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { ok: response.ok, status: response.status, text, json };
    },
    { accessToken: token, urlPath: path },
  );

  if (!result.ok) {
    throw new Error(`Expected ${path} to return 2xx, got ${result.status}: ${result.text}`);
  }
  return result.json as T;
}

async function findSkill(
  page: Page,
  skillName: string,
  token: string,
): Promise<SkillSummary | null> {
  const body = await fetchJson<{ skills?: SkillSummary[] }>(
    page,
    `/api/skills?search=${encodeURIComponent(skillName)}&limit=10`,
    token,
  );
  return body.skills?.find((skill) => skill.name === skillName) ?? null;
}

async function waitForPersistedSkill(
  page: Page,
  skillName: string,
  expectedDescription = DESCRIPTION,
): Promise<SkillDetail> {
  const token = await getAccessToken(page);
  let latestSkill: SkillDetail | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const skill = await findSkill(page, skillName, token);
    if (skill) {
      latestSkill = await fetchJson<SkillDetail>(
        page,
        `/api/skills/${encodeURIComponent(skill._id)}`,
        token,
      );
      if (latestSkill.description === expectedDescription) {
        return latestSkill;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(latestSkill, `Expected skill "${skillName}" to be persisted`).not.toBeNull();
  expect(latestSkill?.description).toBe(expectedDescription);
  return latestSkill!;
}

test.describe('skill file authoring tools', () => {
  test('creates and edits a skill without enabling code execution', async ({ page }) => {
    test.setTimeout(120000);
    const skillName = uniqueSkillName();
    const prompt = [
      `${FINAL_TEXT} request`,
      `E2E_CREATE_SKILL:${skillName}`,
      'Create the skill file using host file authoring only.',
    ].join('\n');
    const editPrompt = [
      `${EDIT_FINAL_TEXT} request`,
      `E2E_EDIT_SKILL:${skillName}`,
      'Edit the skill file using host file authoring only.',
    ].join('\n');

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await enableSkills(page);

    const response = await sendMessage(page, prompt);
    expect(response.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
    const conversationUrl = page.url();
    await expect(
      page.getByTestId('messages-view').getByText(`${FINAL_TEXT}: ${skillName}`),
    ).toBeVisible({ timeout: 30000 });

    const skill = await waitForPersistedSkill(page, skillName);
    expect(skill.description).toBe(DESCRIPTION);
    expect(skill.body).toContain(`name: ${skillName}`);
    expect(skill.body).toContain(DESCRIPTION);

    const editResponse = await sendMessage(page, editPrompt);
    expect(editResponse.ok()).toBeTruthy();

    await expect(
      page.getByTestId('messages-view').getByText(`${EDIT_FINAL_TEXT}: ${skillName}`),
    ).toBeVisible({ timeout: 30000 });

    const editedSkill = await waitForPersistedSkill(page, skillName, EDITED_DESCRIPTION);
    expect(editedSkill.body).toContain(EDITED_DESCRIPTION);

    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(
      page.getByTestId('messages-view').getByText(`${FINAL_TEXT}: ${skillName}`),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByTestId('messages-view').getByText(`${EDIT_FINAL_TEXT}: ${skillName}`),
    ).toBeVisible({ timeout: 30000 });

    await page.goto(`/skills/${editedSkill._id}`, { timeout: 10000 });
    await expect(page.getByRole('heading', { level: 1, name: skillName })).toBeVisible();
    await expect(page.getByText(EDITED_DESCRIPTION)).toBeVisible();
  });
});
