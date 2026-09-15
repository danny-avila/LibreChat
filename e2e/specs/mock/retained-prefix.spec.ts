import { expect, test } from '@playwright/test';
import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessage } from 'librechat-data-provider';
import type { StreamStatusResponse } from '../../../client/src/data-provider/SSE/queries';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  isAgentGenerationStart,
  messagesView,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from './helpers';

test('keeps non-tail THINK edits separate from live TEXT deltas after cold reload and SYNC', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(NEW_CHAT_PATH);
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
  const label = `non-tail-${Date.now()}`;
  const retainedText = `E2E reply ${label}`;
  const editedThink = `User-edited reasoning ${label}`;
  const generatedPrefix = `E2E resume icon reply ${label} `;
  await sendMessageAndWaitForCompletion(page, `E2E_RETAINED_PREFIX:${label}`);
  const conversationId = new URL(page.url()).pathname.split('/').pop()!;
  const token = await getAccessToken(page);
  const row = messagesView(page).locator('.message-render').last();
  await row.hover();
  await row.locator('button[id^="edit-"]').first().click();
  const editors = page.getByRole('region', { name: 'Edit message' }).getByRole('textbox');
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toHaveValue(new RegExp(`E2E reasoning ${label}`));
  await expect(editors.nth(1)).toHaveValue(new RegExp(retainedText));
  await editors.nth(0).fill(editedThink);
  await Promise.all([
    page.waitForResponse(isAgentGenerationStart),
    page.getByRole('button', { name: 'Update & rerun' }).click(),
  ]);
  const textParts = row.locator('.message-content');
  await expect(row).toContainText('chunk-010');

  /** Observe the real XHR stream without replacing status, SYNC or delta payloads.
   * FINAL can repair a corrupt live index, so record its arrival independently
   * of React's stop-button state and assert before it reaches the browser. */
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      let offset = 0;
      this.addEventListener(
        'progress',
        () => {
          if (!this.responseURL.includes('/api/agents/chat/stream/')) return;
          if (new URL(this.responseURL).searchParams.get('resume') !== 'true') return;
          const pending = this.responseText.slice(offset);
          const frames = pending.split(/\r?\n\r?\n/);
          const incomplete = frames.pop()!;
          offset = this.responseText.length - incomplete.length;
          for (const frame of frames) {
            for (const line of frame.split(/\r?\n/)) {
              if (!line.startsWith('data:')) continue;
              const data = JSON.parse(line.slice(5));
              if (data.sync != null) console.debug(`E2E retained-prefix SYNC:${line.slice(5)}`);
              if (data.final != null) console.debug('E2E retained-prefix FINAL');
            }
          }
        },
        /** Observe FINAL before the application's listener can close this XHR. */
        { capture: true },
      );
      send.call(this, body);
    };
  });
  let finalReceived = false;
  page.on('console', (message) => {
    if (message.text() === 'E2E retained-prefix FINAL') finalReceived = true;
  });
  const statusResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/agents/chat/status/${conversationId}`,
  );
  const resumed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/agents/chat/stream/') &&
      new URL(response.url()).searchParams.get('resume') === 'true',
  );
  const syncEvent = page.waitForEvent('console', {
    predicate: (message) => message.text().startsWith('E2E retained-prefix SYNC:'),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const status = await statusResponse;
  expect(status.ok()).toBeTruthy();
  const statusBody: StreamStatusResponse = await status.json();
  expect(statusBody).toMatchObject({ active: true, status: 'running' });
  expect(statusBody.resumeState?.retainedContent).toMatchObject({
    type: ContentTypes.THINK,
    parts: [{ type: ContentTypes.THINK, think: editedThink }, { type: ContentTypes.TEXT }],
  });
  expect((await resumed).ok()).toBeTruthy();
  const sync: { resumeState: Agents.ResumeState } = JSON.parse(
    (await syncEvent).text().slice('E2E retained-prefix SYNC:'.length),
  );
  expect(sync.resumeState.retainedContent).toEqual(statusBody.resumeState?.retainedContent);
  const retainedTail = sync.resumeState.retainedContent!.parts[1];
  const generated = sync.resumeState.aggregatedContent!;
  expect(generated).toHaveLength(1);
  expect(generated[0].type).toBe(ContentTypes.TEXT);
  expect('phase' in generated[0] ? generated[0].phase : undefined).toBe(
    'phase' in retainedTail ? retainedTail.phase : undefined,
  );
  if (
    !('text' in retainedTail) ||
    typeof retainedTail.text !== 'string' ||
    !('text' in generated[0]) ||
    typeof generated[0].text !== 'string'
  ) {
    throw new Error('Expected retained and generated TEXT strings in the real SYNC');
  }
  expect(retainedTail.text.trim()).toBe(retainedText);
  expect(generated[0].text).toContain(generatedPrefix);
  const syncedChunks = [...generated[0].text.matchAll(/chunk-(\d{3})/g)];
  expect(syncedChunks.length).toBeGreaterThan(0);
  const nextChunk = Number(syncedChunks.at(-1)![1]) + 5;
  expect(nextChunk).toBeLessThan(240);

  /** This token did not exist in SYNC: only subsequent real deltas can render it. */
  await expect(textParts).toHaveCount(2);
  await expect(textParts.nth(1)).toContainText(`chunk-${String(nextChunk).padStart(3, '0')}`);
  await expect(textParts.nth(0)).toHaveText(retainedText);
  const liveGenerated = await textParts.nth(1).innerText();
  const chunks = Array.from(
    { length: 240 },
    (_, index) => `chunk-${String(index).padStart(3, '0')}`,
  ).join(' ');
  const completeGenerated = `${generatedPrefix}${chunks}`;
  expect(completeGenerated.startsWith(liveGenerated.trim())).toBe(true);
  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
  expect(finalReceived, 'live-part assertions must precede authoritative FINAL').toBe(false);

  await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
    timeout: 60_000,
  });
  expect(finalReceived).toBe(true);
  await expect(textParts).toHaveText([retainedText, completeGenerated]);
  await expect
    .poll(async () => {
      const messages = await fetchJson<TMessage[]>(page, `/api/messages/${conversationId}`, token);
      const response = messages.find(
        (message) => message.messageId === sync.resumeState.responseMessageId,
      );
      return response && { unfinished: response.unfinished === true, content: response.content };
    })
    .toEqual({
      unfinished: false,
      content: [
        expect.objectContaining({ type: ContentTypes.THINK, think: editedThink }),
        expect.objectContaining({ type: ContentTypes.TEXT, text: retainedTail.text }),
        expect.objectContaining({ type: ContentTypes.TEXT, text: completeGenerated }),
      ],
    });
  await page.reload();
  await expect(textParts).toHaveText([retainedText, completeGenerated]);
});

for (const stop of [false, true]) {
  test(`retains an edited prefix through reconnect, reload and ${stop ? 'Stop' : 'FINAL'}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(stop ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto(NEW_CHAT_PATH);
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const label = `retained-${Date.now()}`;
    await sendMessageAndWaitForCompletion(page, `E2E_SLOW_REPLY:${label}`, { timeout: 40_000 });
    const conversationId = new URL(page.url()).pathname.split('/').pop()!;
    const token = await getAccessToken(page);
    const row = messagesView(page).locator('.message-render').last();
    await row.hover();
    await row.locator('button[id^="edit-"]').first().click();
    const prefix = `User-retained-prefix-${label}. `;
    const editor = page.getByRole('region', { name: 'Edit message' }).getByRole('textbox');
    await expect(editor).toBeVisible();
    await editor.fill(prefix);
    await Promise.all([
      page.waitForResponse(isAgentGenerationStart),
      page.getByRole('button', { name: 'Update & rerun' }).click(),
    ]);
    const responseContent = messagesView(page)
      .locator('.message-render')
      .last()
      .locator('.message-content');
    await expect(responseContent).toContainText('chunk-010');
    await expect(responseContent).toContainText(prefix.trim());

    const resumed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/agents/chat/stream/') &&
        new URL(response.url()).searchParams.get('resume') === 'true',
    );
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect((await resumed).ok()).toBeTruthy();
    await expect(responseContent).toContainText(prefix.trim());
    await page.reload();
    await expect(responseContent).toContainText(prefix.trim());
    const stopButton = page.getByRole('button', { name: 'Stop generating' });
    if (stop) {
      await stopButton.click();
    }
    await expect(stopButton).toBeHidden({ timeout: 40_000 });
    const chunks = Array.from(
      { length: 160 },
      (_, index) => `chunk-${String(index).padStart(3, '0')}`,
    ).join(' ');
    const completeText = `${prefix}E2E slow reply ${label} ${chunks}`;
    if (!stop) {
      await expect(responseContent).toHaveText(completeText);
    }
    expect((await responseContent.innerText()).split(prefix.trim())).toHaveLength(2);

    await expect
      .poll(async () => {
        const messages = await fetchJson<TMessage[]>(
          page,
          `/api/messages/${conversationId}`,
          token,
        );
        const response = messages.find(
          (message) =>
            !message.isCreatedByUser &&
            JSON.stringify(message.content ?? []).includes(prefix.trim()),
        );
        return response == null
          ? null
          : {
              copies: JSON.stringify(response.content).split(prefix.trim()).length - 1,
              unfinished: response.unfinished === true,
            };
      })
      .toEqual({ copies: 1, unfinished: stop });
    await page.reload();
    await expect(responseContent).toContainText(prefix.trim());
    expect((await responseContent.innerText()).split(prefix.trim())).toHaveLength(2);
    if (!stop) {
      await expect(responseContent).toHaveText(completeText);
    }
  });
}
