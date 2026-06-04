import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  enableRunCode,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

const COMMAND = 'printf "resumable-bash-ok"';

type FaultMode = 'before-args' | 'after-first-args';

type StreamEventRecord = {
  url: string;
  isResume: boolean;
  eventName: string;
  kind: string;
  payloadEvent?: string;
  hasBashTool: boolean;
  hasCommand: boolean;
};

test.setTimeout(120000);

async function installStreamProbe(page: Page, faultMode: FaultMode) {
  await page.addInitScript(
    ({ commandText, mode }) => {
      type ReproWindow = Window & {
        __libreChatSseReproEvents?: StreamEventRecord[];
        __libreChatSseReproFaulted?: boolean;
        __libreChatSseReproFaultHadArgs?: boolean;
        __libreChatSseReproFaultInjected?: boolean;
      };

      const reproWindow = window as ReproWindow;
      reproWindow.__libreChatSseReproEvents = [];

      const parseSseBlock = (block: string) => {
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of block.split(/\r\n|\n|\r/)) {
          if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart());
          }
        }
        const data = dataLines.join('\n');
        if (!data) {
          return null;
        }
        let parsed: Record<string, unknown> | undefined;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          parsed = undefined;
        }
        const payloadEvent = typeof parsed?.event === 'string' ? parsed.event : undefined;
        const payloadType = typeof parsed?.type === 'string' ? parsed.type : undefined;
        const kind =
          parsed?.sync === true
            ? 'sync'
            : parsed?.final != null
              ? 'final'
              : parsed?.created != null
                ? 'created'
                : (payloadEvent ?? payloadType ?? 'unknown');
        return {
          eventName,
          kind,
          payloadEvent,
          hasBashTool: data.includes('bash_tool'),
          hasCommand: data.includes(commandText),
        };
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
        (this as XMLHttpRequest & { __libreChatSseReproUrl?: string }).__libreChatSseReproUrl =
          String(url);
        return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
      };
      XMLHttpRequest.prototype.send = function patchedSend(body) {
        const xhr = this as XMLHttpRequest & { __libreChatSseReproUrl?: string };
        const url = xhr.__libreChatSseReproUrl ?? '';
        if (!url.includes('/api/agents/chat/stream/')) {
          return originalSend.call(this, body);
        }

        let parsedLength = 0;
        let eventBuffer = '';
        const recordProgress = () => {
          const nextChunk = this.responseText.slice(parsedLength);
          if (!nextChunk) {
            return;
          }
          parsedLength = this.responseText.length;
          eventBuffer += nextChunk;
          const blocks = eventBuffer.split(/(?:\r\n\r\n|\n\n|\r\r)/);
          eventBuffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const parsed = parseSseBlock(block);
            if (parsed) {
              reproWindow.__libreChatSseReproEvents?.push({
                url,
                isResume: url.includes('resume=true'),
                ...parsed,
              });
            }
          }
        };

        this.addEventListener('progress', recordProgress);
        this.addEventListener('load', recordProgress);

        const shouldFault =
          !url.includes('resume=true') &&
          !reproWindow.__libreChatSseReproFaulted &&
          url.includes('/api/agents/chat/stream/');
        if (shouldFault && mode === 'before-args') {
          let idleTimer: ReturnType<typeof window.setTimeout> | undefined;
          const faultIfStillCreatingInput = () => {
            recordProgress();
            if (reproWindow.__libreChatSseReproFaulted || this.responseText.includes('bash_tool')) {
              return;
            }
            reproWindow.__libreChatSseReproFaulted = true;
            reproWindow.__libreChatSseReproFaultHadArgs = this.responseText.includes('bash_tool');
            reproWindow.__libreChatSseReproFaultInjected = true;
            this.dispatchEvent(new Event('error'));
            this.abort();
          };
          const armIdleTimer = () => {
            if (reproWindow.__libreChatSseReproFaulted || this.responseText.includes('bash_tool')) {
              return;
            }
            if (idleTimer) {
              window.clearTimeout(idleTimer);
            }
            idleTimer = window.setTimeout(faultIfStillCreatingInput, 800);
          };
          this.addEventListener('readystatechange', () => {
            if (this.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
              armIdleTimer();
            }
          });
          this.addEventListener('progress', armIdleTimer);
          this.addEventListener(
            'loadend',
            () => {
              if (idleTimer) {
                window.clearTimeout(idleTimer);
              }
            },
            { once: true },
          );
        } else if (shouldFault && mode === 'after-first-args') {
          this.addEventListener('progress', () => {
            recordProgress();
            if (
              reproWindow.__libreChatSseReproFaulted ||
              !this.responseText.includes('bash_tool')
            ) {
              return;
            }
            reproWindow.__libreChatSseReproFaulted = true;
            reproWindow.__libreChatSseReproFaultHadArgs = true;
            window.setTimeout(() => {
              reproWindow.__libreChatSseReproFaultInjected = true;
              this.dispatchEvent(new Event('error'));
              this.abort();
            }, 400);
          });
        }

        return originalSend.call(this, body);
      };
    },
    { commandText: COMMAND, mode: faultMode },
  );
}

async function runBashResumeCase(page: Page, faultMode: FaultMode) {
  const streamUrls: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/agents/chat/stream/')) {
      streamUrls.push(url);
    }
  });

  await installStreamProbe(page, faultMode);
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
  await enableRunCode(page);

  const response = await sendMessage(
    page,
    [`E2E bash resume request`, `E2E_BASH_TOOL_STREAM:${COMMAND}`].join('\n'),
  );
  expect(response.ok()).toBeTruthy();

  await expect.poll(() => streamUrls.length, { timeout: 15000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            (window as Window & { __libreChatSseReproFaultInjected?: boolean })
              .__libreChatSseReproFaultInjected,
          ),
        ),
      { timeout: 10000 },
    )
    .toBeTruthy();

  await expect
    .poll(() => streamUrls.filter((url) => url.includes('resume=true')).length, {
      timeout: 20000,
    })
    .toBeGreaterThan(0);

  const commandCode = page.getByTestId('messages-view').locator('code').filter({
    hasText: COMMAND,
  });
  await expect(commandCode).toBeVisible({ timeout: 30000 });
  await expect(commandCode).toHaveCount(1);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            (
              (window as Window & { __libreChatSseReproEvents?: StreamEventRecord[] })
                .__libreChatSseReproEvents ?? []
            ).some((event) => event.payloadEvent === 'on_run_step_completed'),
          ),
        ),
      { timeout: 30000 },
    )
    .toBeTruthy();

  return page.evaluate(
    () =>
      ({
        faultHadArgs: Boolean(
          (window as Window & { __libreChatSseReproFaultHadArgs?: boolean })
            .__libreChatSseReproFaultHadArgs,
        ),
        events:
          (window as Window & { __libreChatSseReproEvents?: StreamEventRecord[] })
            .__libreChatSseReproEvents ?? [],
      }) as { faultHadArgs: boolean; events: StreamEventRecord[] },
  );
}

test.describe('resumable SSE bash tool calls', () => {
  test('starts the bash tool call on the resumed stream when the first stream idles before args', async ({
    page,
  }) => {
    const { faultHadArgs, events } = await runBashResumeCase(page, 'before-args');
    expect(faultHadArgs).toBe(false);

    const initialEvents = events.filter((event) => !event.isResume);
    const resumeEvents = events.filter((event) => event.isResume);
    expect(initialEvents.some((event) => event.hasBashTool)).toBe(false);
    expect(resumeEvents.some((event) => event.kind === 'sync')).toBe(true);
    expect(
      resumeEvents.some((event) => event.payloadEvent === 'on_run_step' && event.hasBashTool),
    ).toBe(true);
    expect(
      resumeEvents.some((event) => event.payloadEvent === 'on_run_step_delta' && event.hasBashTool),
    ).toBe(true);
    expect(resumeEvents.some((event) => event.payloadEvent === 'on_run_step_completed')).toBe(true);
  });

  test('syncs the existing bash tool call and continues args when reconnecting after args start', async ({
    page,
  }) => {
    const { faultHadArgs, events } = await runBashResumeCase(page, 'after-first-args');
    expect(faultHadArgs).toBe(true);

    const initialEvents = events.filter((event) => !event.isResume);
    const resumeEvents = events.filter((event) => event.isResume);
    expect(
      initialEvents.some((event) => event.payloadEvent === 'on_run_step' && event.hasBashTool),
    ).toBe(true);
    expect(
      initialEvents.some(
        (event) => event.payloadEvent === 'on_run_step_delta' && event.hasBashTool,
      ),
    ).toBe(true);
    expect(resumeEvents.some((event) => event.kind === 'sync' && event.hasBashTool)).toBe(true);
    expect(
      resumeEvents.some((event) => event.payloadEvent === 'on_run_step' && event.hasBashTool),
    ).toBe(false);
    expect(
      resumeEvents.some((event) => event.payloadEvent === 'on_run_step_delta' && event.hasBashTool),
    ).toBe(true);
    expect(resumeEvents.some((event) => event.payloadEvent === 'on_run_step_completed')).toBe(true);
  });
});
