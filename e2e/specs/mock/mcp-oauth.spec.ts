import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  mockReply,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

test.use({ serviceWorkers: 'block' });

const PRELIM_RUN_ID = 'USE_PRELIM_RESPONSE_MESSAGE_ID';
const STREAM_ID = 'e2e-oauth-stream';
const OAUTH_SERVER_NAME = 'Google-Workspace';
const OAUTH_STEP_ID = `step_oauth_login_${OAUTH_SERVER_NAME}`;
const OAUTH_TOOL_CALL = {
  id: `e2e-user:${OAUTH_SERVER_NAME}:1`,
  name: `oauth_mcp_${OAUTH_SERVER_NAME}`,
  type: 'tool_call_chunk',
};
const OAUTH_AUTH_URL =
  'https://demo.librechat.ai/oauth2/authorize?' +
  'redirect_uri=http%3A%2F%2Flocalhost%3A3080%2Fapi%2Fmcp%2FGoogle-Workspace%2Foauth%2Fcallback';

type StreamMockState = {
  startHit: boolean;
  streamHit: boolean;
};

type MockWindow = Window & {
  __mcpOauthMockConfig?: {
    streamBody: string;
    streamId: string;
  };
  __mcpOauthMock?: StreamMockState;
};

function encodeSSEMessage(payload: object) {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

function buildPendingOAuthStream() {
  return [
    encodeSSEMessage({
      event: 'on_run_step',
      data: {
        runId: PRELIM_RUN_ID,
        id: OAUTH_STEP_ID,
        type: 'tool_calls',
        index: 0,
        stepDetails: {
          type: 'tool_calls',
          tool_calls: [OAUTH_TOOL_CALL],
        },
      },
    }),
    encodeSSEMessage({
      event: 'on_run_step_delta',
      data: {
        id: OAUTH_STEP_ID,
        delta: {
          type: 'tool_calls',
          tool_calls: [{ ...OAUTH_TOOL_CALL, args: '' }],
          auth: OAUTH_AUTH_URL,
          expires_at: Date.now() + 120_000,
        },
      },
    }),
  ].join('');
}

async function installPendingOAuthXHRMock(page: Page) {
  await page.addInitScript(
    ({ streamId }) => {
      const mockWindow = window as MockWindow;
      const NativeXHR = window.XMLHttpRequest;
      const nativeFetch = window.fetch.bind(window);
      mockWindow.__mcpOauthMock = { startHit: false, streamHit: false };

      const getConfig = () => mockWindow.__mcpOauthMockConfig;

      const shouldMockStart = (method: string, url: string) =>
        getConfig() != null &&
        method === 'POST' &&
        url.includes('/api/agents/chat/') &&
        !url.includes('/api/agents/chat/abort') &&
        !url.includes('/api/agents/chat/stream/');

      const shouldMockStream = (method: string, url: string) => {
        const config = getConfig();
        return (
          config != null &&
          method === 'GET' &&
          url.includes(`/api/agents/chat/stream/${config.streamId}`)
        );
      };

      const markMockHit = (isStart: boolean) => {
        const state = mockWindow.__mcpOauthMock;
        if (!state) {
          return;
        }
        state.startHit ||= isStart;
        state.streamHit ||= !isStart;
      };

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : null;
        const url = request?.url ?? String(input);
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();

        if (shouldMockStart(method, url)) {
          const config = getConfig();
          markMockHit(true);
          return new Response(JSON.stringify({ streamId: config?.streamId ?? streamId }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (shouldMockStream(method, url)) {
          const config = getConfig();
          markMockHit(false);
          return new Response(config?.streamBody ?? '', {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
            },
          });
        }

        return nativeFetch(input, init);
      };

      class MockableXHR extends EventTarget {
        private readonly real = new NativeXHR();
        private mock = false;
        private method = '';
        private requestUrl = '';
        private responseHeaders = '';
        private mockReadyState = 0;
        private mockStatus = 0;
        private mockResponseText = '';
        public onabort: ((event: Event) => void) | null = null;
        public onerror: ((event: Event) => void) | null = null;
        public onload: ((event: Event) => void) | null = null;
        public onloadend: ((event: Event) => void) | null = null;
        public onprogress: ((event: Event) => void) | null = null;
        public onreadystatechange: ((event: Event) => void) | null = null;
        public responseType: XMLHttpRequestResponseType = '';
        public timeout = 0;
        public upload = this.real.upload;
        public withCredentials = false;

        constructor() {
          super();
          for (const type of [
            'abort',
            'error',
            'load',
            'loadend',
            'progress',
            'readystatechange',
          ]) {
            this.real.addEventListener(type, () => this.emit(type));
          }
        }

        get readyState() {
          return this.mock ? this.mockReadyState : this.real.readyState;
        }

        get response() {
          if (!this.mock) {
            return this.real.response;
          }
          if (this.responseType === 'json') {
            try {
              return JSON.parse(this.mockResponseText);
            } catch {
              return null;
            }
          }
          return this.mockResponseText;
        }

        get responseText() {
          return this.mock ? this.mockResponseText : this.real.responseText;
        }

        get responseURL() {
          return this.mock ? this.requestUrl : this.real.responseURL;
        }

        get status() {
          return this.mock ? this.mockStatus : this.real.status;
        }

        get statusText() {
          return this.mock ? 'OK' : this.real.statusText;
        }

        open(
          method: string,
          url: string | URL,
          async = true,
          username?: string,
          password?: string,
        ) {
          this.method = method.toUpperCase();
          this.requestUrl = String(url);
          this.mock =
            shouldMockStart(this.method, this.requestUrl) ||
            shouldMockStream(this.method, this.requestUrl);

          if (!this.mock) {
            this.real.open(method, url, async, username, password);
            return;
          }

          this.mockReadyState = 1;
          this.emit('readystatechange');
        }

        setRequestHeader(name: string, value: string) {
          if (!this.mock) {
            this.real.setRequestHeader(name, value);
          }
        }

        getResponseHeader(name: string) {
          if (!this.mock) {
            return this.real.getResponseHeader(name);
          }
          return name.toLowerCase() === 'content-type'
            ? this.method === 'POST'
              ? 'application/json'
              : 'text/event-stream; charset=utf-8'
            : null;
        }

        getAllResponseHeaders() {
          return this.mock ? this.responseHeaders : this.real.getAllResponseHeaders();
        }

        overrideMimeType(mimeType: string) {
          if (!this.mock) {
            this.real.overrideMimeType(mimeType);
          }
        }

        abort() {
          if (!this.mock) {
            this.real.abort();
            return;
          }
          this.emit('abort');
          this.emit('loadend');
        }

        send(body?: Document | XMLHttpRequestBodyInit | null) {
          if (!this.mock) {
            this.real.withCredentials = this.withCredentials;
            this.real.timeout = this.timeout;
            this.real.responseType = this.responseType;
            this.real.send(body);
            return;
          }

          const isStart = this.method === 'POST';
          const config = getConfig();
          markMockHit(isStart);

          this.mockStatus = 200;
          this.mockResponseText = isStart
            ? JSON.stringify({ streamId: config?.streamId ?? streamId })
            : (config?.streamBody ?? '');
          this.responseHeaders = isStart
            ? 'Content-Type: application/json\r\n'
            : 'Content-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-cache\r\n';

          setTimeout(() => {
            this.mockReadyState = isStart ? 4 : 3;
            this.emit('readystatechange');
            this.emit('progress');
            this.mockReadyState = 4;
            this.emit('readystatechange');
            this.emit('load');
            this.emit('loadend');
          }, 0);
        }

        private emit(type: string) {
          const event = new Event(type);
          const handler = this[`on${type}` as keyof MockableXHR];
          if (typeof handler === 'function') {
            handler.call(this, event);
          }
          this.dispatchEvent(event);
        }
      }

      Object.assign(MockableXHR, {
        UNSENT: 0,
        OPENED: 1,
        HEADERS_RECEIVED: 2,
        LOADING: 3,
        DONE: 4,
      });

      window.XMLHttpRequest = MockableXHR as typeof XMLHttpRequest;
    },
    {
      streamId: STREAM_ID,
    },
  );
}

async function enablePendingOAuthXHRMock(page: Page) {
  await page.evaluate(
    ({ streamBody, streamId }) => {
      const mockWindow = window as MockWindow;
      mockWindow.__mcpOauthMockConfig = { streamBody, streamId };
      mockWindow.__mcpOauthMock = { startHit: false, streamHit: false };
    },
    {
      streamBody: buildPendingOAuthStream(),
      streamId: STREAM_ID,
    },
  );
}

async function clickLatestRegenerate(page: Page) {
  const latestMessage = page.getByTestId('messages-view').locator('.message-render').last();
  await latestMessage.hover();
  const regenerateButton = latestMessage.locator('button[title="Regenerate"]').last();
  await expect(regenerateButton).toBeVisible();
  await regenerateButton.click();
}

test.describe('MCP OAuth stream UX', () => {
  test('keeps pending OAuth regenerate events attached to the assistant row after reload', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const userMessage = 'start an existing conversation before mcp oauth';

    await installPendingOAuthXHRMock(page);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, userMessage);
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText(userMessage)).toBeVisible();
    await expect(mockReply(page)).toBeVisible();
    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/);

    const conversationUrl = page.url();

    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(mockReply(page)).toBeVisible();

    await enablePendingOAuthXHRMock(page);
    await clickLatestRegenerate(page);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = (window as MockWindow).__mcpOauthMock;
          return Boolean(state?.startHit && state.streamHit);
        }),
      )
      .toBe(true);

    const messageRows = page.getByTestId('messages-view').locator('.message-render');
    await expect(messageRows).toHaveCount(2);
    await expect(messageRows.nth(0)).toContainText(userMessage);
    await expect(messageRows.nth(0).locator('.user-turn')).toBeVisible();
    await expect(messageRows.nth(1).locator('.agent-turn')).toBeVisible();
    await expect(messageRows.nth(1)).toContainText('Requires Authentication');
    await expect(messageRows.nth(1)).toContainText(OAUTH_SERVER_NAME);
    await expect(messageRows.nth(1)).toContainText('Sign-in to demo.librechat.ai');
  });
});
