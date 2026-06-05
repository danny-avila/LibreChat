import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  selectMockEndpoint,
} from './helpers';

/**
 * Unified file upload — per-mime-type delivery routing (PR #12626).
 *
 * What this proves end-to-end (real backend + DB), and what it deliberately can't:
 * - The composer renders ONE attach button (unified mode), not the legacy 3-way
 *   dropdown — `legacyFileUploadUX` is unset in e2e/config/librechat.e2e.yaml.
 * - A spreadsheet/csv upload routes through `processAgentFileUpload` and persists
 *   `llmDeliveryPath: 'none'` per the configured `defaultLLMDeliveryPath` override,
 *   i.e. it is NOT delivered to the LLM as text/provider — reachable only by tools.
 * - The mock harness has no code-execution environment, so the "available to the
 *   code interpreter at tool-execute time" half is covered by jest
 *   (`packages/api/src/agents/resources.test.ts`), not here.
 *
 * `.xlsx` follows the identical code path (same `defaultLLMDeliveryPath` override,
 * same standard-storage branch); csv is used here so the uploaded bytes match the
 * declared mime type without synthesizing a binary spreadsheet.
 */

const uniqueName = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

type UploadedFile = { filename?: string; type?: string; llmDeliveryPath?: string };

const isFilesUpload = (url: string, method: string) =>
  method === 'POST' && /\/api\/files(?:\?|$)/.test(new URL(url).pathname);

async function uploadViaUnifiedButton(page: Page, fileName: string) {
  const csv = 'name,score\nalice,1\nbob,2\n';
  const uploadResponse = page.waitForResponse((r) => isFilesUpload(r.url(), r.request().method()), {
    timeout: 30000,
  });
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#attach-file-button').click(),
  ]);
  await fileChooser.setFiles({
    name: fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  return uploadResponse;
}

test.describe('unified file upload', () => {
  test('single attach button routes a csv to llmDeliveryPath "none"', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    // Default model needs a real key; pick a mock endpoint so the composer is live.
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    // Unified mode: one attach button, and the legacy multi-option dropdown trigger
    // is not rendered at all.
    await expect(page.locator('#attach-file-button')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#attach-file-menu-button')).toHaveCount(0);

    // Upload-time routing: the configured override (csv -> none) must persist, so
    // the file is kept out of LLM delivery and left for tools (code interpreter).
    const fileName = `${uniqueName('data')}.csv`;
    const response = await uploadViaUnifiedButton(page, fileName);
    expect(response.ok()).toBeTruthy();

    const uploaded = (await response.json()) as UploadedFile;
    expect(uploaded.filename).toBe(fileName);
    expect(uploaded.llmDeliveryPath).toBe('none');

    // Persistence: the file is queryable from the backend with the same routing.
    const token = await getAccessToken(page);
    const files = await fetchJson<UploadedFile[]>(page, '/api/files', token);
    const persisted = files.find((f) => f.filename === fileName);
    expect(persisted, `uploaded file "${fileName}" should persist`).toBeTruthy();
    expect(persisted?.llmDeliveryPath).toBe('none');
  });
});
