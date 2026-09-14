import { expect, test } from '@playwright/test';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  selectMockEndpoint,
  sendMessage,
  sendMessageAndWaitForCompletion,
} from './helpers';

const ORDERED_PIECE_COUNT = 64;

const orderedPieces = () =>
  Array.from(
    { length: ORDERED_PIECE_COUNT },
    (_, index) => `piece-${String(index).padStart(3, '0')}`,
  );

test.describe('stream transport fidelity', () => {
  test.describe('terminal recovery', () => {
    /** Service workers can bypass Playwright's network fault injection. */
    test.use({ serviceWorkers: 'block' });
    test('uses late startup config for a sidebar resume and bounds unnegotiated recovery', async ({
      page,
      context,
    }) => {
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
      const label = `late-config-${Date.now()}`;
      await sendMessageAndWaitForCompletion(page, `E2E_REPLY:${label}`);
      const expected = `E2E reply ${label}`;
      await expect(messagesView(page)).toContainText(expected);
      const conversationUrl = page.url();
      const conversationId = new URL(conversationUrl).pathname.split('/')[2];
      let releaseConfig!: () => void;
      const configReady = new Promise<void>((resolve) => {
        releaseConfig = resolve;
      });
      await page.route('**/api/config', async (route) => {
        if (!route.request().headers().authorization) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        await configReady;
        await route.fulfill({
          response,
          json: {
            ...(await response.json()),
            resumableStreams: { terminalRecoveryMaxRetries: 0 },
          },
        });
      });
      let attachments = 0;
      let recovered = false;
      let generationPosts = 0;
      await page.route(`**/api/messages/${conversationId}`, async (route) => {
        if (recovered) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const messages: TMessage[] = await response.json();
        const assistant = messages.findLast((message) => !message.isCreatedByUser);
        if (assistant == null) throw new Error('Expected a persisted assistant response');
        assistant.text = 'Pending recovery';
        assistant.content = [{ type: ContentTypes.TEXT, text: 'Pending recovery' }];
        await route.fulfill({ response, json: messages });
      });
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          /^\/api\/agents\/chat(?:\/|$)/.test(new URL(request.url()).pathname)
        ) {
          generationPosts++;
        }
      });
      /** Reproduce an active snapshot followed by a legacy responder during
       * rollout. Keep real generation metadata and persisted messages. */
      await page.route(`**/api/agents/chat/status/${conversationId}?*`, async (route) => {
        if (recovered) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        const status = await response.json();
        expect(status.resumeState).toBeTruthy();
        const aggregatedContent = [{ type: ContentTypes.TEXT, text: 'Pending recovery' }];
        await route.fulfill({
          response,
          json: {
            ...status,
            active: true,
            status: 'running',
            generationProtocolVersion: attachments === 0 ? 2 : 1,
            aggregatedContent,
            resumeState: { ...status.resumeState, aggregatedContent },
          },
        });
      });
      await page.route(`**/api/agents/chat/stream/${conversationId}?*`, async (route) => {
        expect(new URL(route.request().url()).searchParams.get('resume')).toBe('true');
        attachments++;
        await route.fulfill({ status: 404, json: { error: 'Stream expired' } });
      });
      const configResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/config' &&
          !!response.request().headers().authorization,
      );
      const unnegotiated = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/agents/chat/status/${conversationId}` &&
          attachments > 0,
      );
      try {
        /** A row for the current URL is intentionally a no-op; enter from new chat. */
        await page.goto(NEW_CHAT_PATH);
        await page.getByTestId('convo-item').first().click();
        await unnegotiated;
        expect(attachments).toBe(1);
        await expect(messagesView(page)).toContainText('Pending recovery');
        releaseConfig();
        await (await configResponse).finished();
        /** Observe beyond the one-second pending retry, not just its scheduling task. */
        await page.waitForTimeout(1_500);
        expect(attachments).toBe(1);
        await expect(messagesView(page)).not.toContainText(expected);
        recovered = true;
        await context.setOffline(true);
        await context.setOffline(false);
        await expect(messagesView(page)).toContainText(expected);
        expect(attachments).toBe(2);
        expect(generationPosts).toBe(0);
        expect(page.url()).toBe(conversationUrl);
      } finally {
        releaseConfig();
      }
    });

    for (const existingConversation of [false, true]) {
      const maxRetries = 2;
      const failureCount = maxRetries + 1;
      const scenario = existingConversation
        ? 'on reconnect after exhausting history retries'
        : 'on the first turn';
      test(`recovers a lost terminal event ${scenario}`, async ({ page, context }) => {
        test.setTimeout(90_000);
        if (existingConversation) {
          await page.route('**/api/config', async (route) => {
            const response = await route.fetch();
            await route.fulfill({
              response,
              json: {
                ...(await response.json()),
                resumableStreams: { terminalRecoveryMaxRetries: maxRetries },
              },
            });
          });
          await page.addInitScript((failureCount) => {
            let failedReads = 0;
            const send = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (body) {
              this.addEventListener(
                'loadend',
                () => {
                  if (this.status !== 503 || !this.responseURL.includes('/api/messages/')) return;
                  if (++failedReads !== failureCount) return;
                  /** Yield past the XHR task's promise rejection chain, so the
                   * hook has consumed its last failure before we go online. */
                  setTimeout(() => console.debug('E2E terminal history failures consumed'), 0);
                },
                { once: true },
              );
              send.call(this, body);
            };
          }, failureCount);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
        await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
        if (existingConversation) {
          await sendMessageAndWaitForCompletion(page, 'E2E_REPLY:seed-history');
          await page.reload();
          await expect(messagesView(page)).toContainText('E2E reply seed-history');
        }
        await page.route('**/api/agents/chat/stream/**', async (route) => {
          const url = new URL(route.request().url());
          if (url.searchParams.get('resume') === 'true') {
            if (existingConversation) {
              await route.fulfill({ status: 404, json: { error: 'Stream expired' } });
            } else {
              await route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: `data: ${JSON.stringify({
                  final: true,
                  reconcile: true,
                  reconcileReason: 'terminal_payload_missing',
                  terminalStatus: 'complete',
                  generationCreatedAt: Number(url.searchParams.get('generationCreatedAt')),
                  generationProtocolVersion: 2,
                })}\n\n`,
              });
            }
            return;
          }
          /** Let the real generation persist, but deliver only its created frame.
           * The client loses output and FINAL without receiving a transport error. */
          const response = await route.fetch();
          const frames = (await response.text()).split(/\r?\n\r?\n/);
          const created = frames.filter((frame) =>
            frame.split(/\r?\n/).some((line) => {
              return line.startsWith('data:') && JSON.parse(line.slice(5)).created != null;
            }),
          );
          expect(created.length).toBeGreaterThan(0);
          await route.fulfill({ response, body: `${created.join('\n\n')}\n\n` });
        });

        const label = `lost-terminal-${Date.now()}`;
        const stream = page.waitForResponse((response) =>
          new URL(response.url()).pathname.startsWith('/api/agents/chat/stream/'),
        );
        await sendMessage(page, `E2E_REPLY:${label}`);
        await (await stream).finished();
        const expected = `E2E reply ${label}`;
        await expect(messagesView(page)).not.toContainText(expected);
        const conversationUrl = page.url();
        let failedHistoryReads = 0;
        if (existingConversation) {
          await page.route(
            '**/api/messages/*',
            async (route) => {
              failedHistoryReads++;
              await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
            },
            { times: failureCount },
          );
        }
        const failedHistory = existingConversation
          ? page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname.startsWith('/api/messages/') &&
                response.status() === 503,
            )
          : undefined;
        const failuresConsumed = existingConversation
          ? page.waitForEvent('console', {
              predicate: (message) => message.text() === 'E2E terminal history failures consumed',
              timeout: 45_000,
            })
          : undefined;
        await page.evaluate(() =>
          document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
        );
        await failedHistory;
        if (existingConversation) {
          await failuresConsumed;
          expect(failedHistoryReads).toBe(failureCount);
          await expect(messagesView(page)).not.toContainText(expected);
          /** Keep the page visible: only the browser's online event can rearm
           * the exhausted terminal recovery, not another foreground event. */
          await context.setOffline(true);
          await context.setOffline(false);
        }
        await expect(messagesView(page)).toContainText(expected, { timeout: 15000 });
        expect(page.url()).toBe(conversationUrl);
      });
    }
  });

  test('refreshes a stopped partial response on foreground without switching conversations', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const label = `completed-foreground-${Date.now()}`;
    await sendMessageAndWaitForCompletion(page, `E2E_REPLY:${label}`);
    const expected = `E2E reply ${label}`;
    await expect(messagesView(page)).toContainText(expected);

    /** Reproduce the stale cache left by an interrupted terminal reconciliation.
     * The real server retains the complete response for the foreground refetch. */
    await page.route(
      '**/api/messages/*',
      async (route) => {
        const response = await route.fetch();
        const messages: TMessage[] = await response.json();
        const assistant = messages.findLast((message) => !message.isCreatedByUser);
        if (assistant == null) throw new Error('Expected a persisted assistant response');
        assistant.text = '';
        assistant.content = [
          {
            type: ContentTypes.TOOL_CALL,
            tool_call: { id: 'missed-completion', name: 'subagent', args: '{}', progress: 0.1 },
          },
        ];
        await route.fulfill({ response, json: messages });
      },
      { times: 1 },
    );
    await page.reload();
    await expect(messagesView(page).getByText('Agent stopped', { exact: true })).toBeVisible();
    await expect(messagesView(page)).not.toContainText(expected);
    const conversationUrl = page.url();

    const refreshed = page.waitForResponse((response) =>
      new URL(response.url()).pathname.startsWith('/api/messages/'),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true })),
    );
    expect((await refreshed).ok()).toBeTruthy();
    await expect(messagesView(page)).toContainText(expected);
    await expect(messagesView(page).getByText('Agent stopped', { exact: true })).toHaveCount(0);
    expect(page.url()).toBe(conversationUrl);
  });

  test('resumes a running generation on foreground without duplicating its response', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const label = `foreground-${Date.now()}`;
    await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
    const assistantContent = messagesView(page)
      .locator('.message-render')
      .last()
      .locator('.message-content');
    await expect(assistantContent).toContainText('chunk-010', { timeout: 30000 });

    const resumed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/agents/chat/stream/') &&
        new URL(response.url()).searchParams.get('resume') === 'true',
    );
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    expect((await resumed).ok()).toBeTruthy();

    const chunks = Array.from(
      { length: 160 },
      (_, index) => `chunk-${String(index).padStart(3, '0')}`,
    ).join(' ');
    await expect(assistantContent).toHaveText(`E2E slow reply ${label} ${chunks}`, {
      timeout: 30000,
    });
  });

  test('renders and persists every LLM chunk exactly once and in order', async ({ page }) => {
    const label = `ordered-${Date.now()}`;
    const expected = `E2E ordered reply ${label} ${orderedPieces().join(' ')}`;

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessageAndWaitForCompletion(page, `E2E_ORDERED_REPLY:${label}`);
    expect(response.ok()).toBeTruthy();

    const assistantContent = messagesView(page)
      .locator('.message-render')
      .last()
      .locator('.message-content');
    await expect(assistantContent).toContainText('piece-010', { timeout: 30000 });
    await expect(assistantContent).toHaveText(expected, { timeout: 30000 });

    await page.reload({ timeout: 10000 });
    await expect(
      messagesView(page).locator('.message-render').last().locator('.message-content'),
    ).toHaveText(expected, { timeout: 30000 });
  });
});
