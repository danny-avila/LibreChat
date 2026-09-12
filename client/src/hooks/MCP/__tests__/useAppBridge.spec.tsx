import React from 'react';
import { RecoilRoot } from 'recoil';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UIResource } from 'librechat-data-provider';
import { useAppBridge } from '~/hooks/MCP/useAppBridge';
import { useIsMessagesViewReadOnly } from '~/Providers';
import { fetchMCPResourceHtml } from '~/utils/mcpApps';

type Listener = (params: unknown) => void;

class FakeAppBridge {
  static instances: FakeAppBridge[] = [];
  capabilities: Record<string, unknown>;
  listeners = new Map<string, Listener[]>();
  connected: unknown = null;
  closed = false;
  resourceReady: Array<Record<string, unknown>> = [];
  toolInput: unknown[] = [];
  toolResults: unknown[] = [];
  hostContextChanges: unknown[] = [];
  teardowns = 0;
  onopenlink?: (params: { url: string }) => Promise<unknown>;
  oninitialized?: () => Promise<void>;
  oncalltool?: unknown;
  onreadresource?: unknown;
  onlistresources?: unknown;
  onlistresourcetemplates?: unknown;
  onmessage?: unknown;

  constructor(
    _transport: unknown,
    _info: unknown,
    capabilities: Record<string, unknown>,
    _options: unknown,
  ) {
    this.capabilities = capabilities;
    FakeAppBridge.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  emit(type: string, params: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(params);
    }
  }

  async connect(transport: unknown) {
    this.connected = transport;
  }

  close() {
    this.closed = true;
  }

  async sendSandboxResourceReady(params: Record<string, unknown>) {
    this.resourceReady.push(params);
  }

  async sendToolInput(params: unknown) {
    this.toolInput.push(params);
  }

  async sendToolResult(params: unknown) {
    this.toolResults.push(params);
  }

  async sendHostContextChange(params: unknown) {
    this.hostContextChanges.push(params);
  }

  async teardownResource() {
    this.teardowns += 1;
    return {};
  }
}

jest.mock('@modelcontextprotocol/ext-apps/app-bridge', () => ({
  AppBridge: jest.fn(),
  PostMessageTransport: jest.fn().mockImplementation((post: unknown, listen: unknown) => ({
    post,
    listen,
  })),
  buildAllowAttribute: () => '',
}));

jest.mock('~/utils/mcpApps', () => ({
  ...jest.requireActual('~/utils/mcpApps'),
  fetchMCPResourceHtml: jest.fn(),
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  listMCPResources: jest.fn(),
  listMCPResourceTemplates: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useOptionalMessagesOperations: () => ({ ask: jest.fn() }),
  useIsMessagesViewReadOnly: jest.fn(() => false),
}));

const { AppBridge } = jest.requireMock('@modelcontextprotocol/ext-apps/app-bridge') as {
  AppBridge: jest.Mock;
};
const mockFetchHtml = fetchMCPResourceHtml as jest.MockedFunction<typeof fetchMCPResourceHtml>;
const mockReadOnly = useIsMessagesViewReadOnly as jest.MockedFunction<
  typeof useIsMessagesViewReadOnly
>;

const SANDBOX_URL =
  'http://localhost:3080/api/mcp/sandbox?parentOrigin=http%3A%2F%2Flocalhost%3A3080';

const makeResource = (overrides: Partial<UIResource> = {}): UIResource =>
  ({
    resourceId: 'r1',
    uri: 'ui://app/main',
    mimeType: 'text/html;profile=mcp-app',
    toolName: 'render',
    serverName: 'demo',
    ...overrides,
  }) as UIResource;

function mountBridge(resource: UIResource, client: QueryClient) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
  document.body.appendChild(iframe);
  const iframeRef = { current: iframe };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RecoilRoot>
  );
  const view = renderHook(
    () =>
      useAppBridge({
        iframeRef,
        resource,
        toolArgs: { q: 1 },
        toolResult: { content: [] },
        onSizeChanged: jest.fn(),
        onLoaded: jest.fn(),
        onTeardown: jest.fn(),
        onFailed: jest.fn(),
      }),
    { wrapper },
  );
  return { iframe, view };
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const latest = () => FakeAppBridge.instances[FakeAppBridge.instances.length - 1];

describe('useAppBridge', () => {
  let client: QueryClient;

  beforeEach(() => {
    FakeAppBridge.instances = [];
    AppBridge.mockImplementation(
      (t: unknown, i: unknown, c: Record<string, unknown>, o: unknown) =>
        new FakeAppBridge(t, i, c, o),
    );
    mockReadOnly.mockReturnValue(false);
    mockFetchHtml.mockResolvedValue({ html: '<p>app</p>' });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  describe('ordering', () => {
    it('connects the transport before the sandbox document is requested', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      expect(latest().connected).not.toBeNull();
      expect(iframe.getAttribute('src')).toBeNull();

      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
      await flush();
      expect(iframe.src).toContain('/api/mcp/sandbox');
    });

    it('carries the resolved csp to the sandbox response boundary', async () => {
      mockFetchHtml.mockResolvedValue({
        html: '<p>app</p>',
        csp: { connectDomains: ['https://api.example.com'] },
      });
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      const csp = new URL(iframe.src).searchParams.get('csp');
      expect(JSON.parse(csp as string)).toEqual({ connectDomains: ['https://api.example.com'] });
    });

    it('sends the resource once even when the proxy announces twice', async () => {
      mountBridge(makeResource(), client);
      await flush();

      await act(async () => {
        latest().emit('sandboxready');
        latest().emit('sandboxready');
      });
      await flush();
      expect(latest().resourceReady).toHaveLength(1);
      expect(latest().resourceReady[0].html).toBe('<p>app</p>');
    });

    it('attaches no bridge and no src when cancelled mid-fetch', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      const { iframe, view } = mountBridge(makeResource(), client);
      await flush();
      view.unmount();

      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
      expect(iframe.getAttribute('src')).toBeNull();
      expect(latest().closed).toBe(true);
    });
  });

  describe('refetching changed html (3745939818)', () => {
    it('reads again on a later mount instead of serving a stale document', async () => {
      mockFetchHtml.mockResolvedValueOnce({ html: '<p>v1</p>' });
      const first = mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();
      expect(latest().resourceReady[0].html).toBe('<p>v1</p>');
      first.view.unmount();

      mockFetchHtml.mockResolvedValueOnce({ html: '<p>v2</p>' });
      mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).toHaveBeenCalledTimes(2);
      expect(latest().resourceReady[0].html).toBe('<p>v2</p>');
    });

    it('collapses concurrent mounts of one resource into a single read', async () => {
      mountBridge(makeResource(), client);
      mountBridge(makeResource(), client);
      await flush();
      expect(mockFetchHtml).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure handling', () => {
    it('retries on the next proxy announcement instead of latching', async () => {
      mockFetchHtml.mockRejectedValueOnce(new Error('boom'));
      mountBridge(makeResource(), client);
      await flush();
      expect(latest().resourceReady).toHaveLength(0);

      mockFetchHtml.mockResolvedValueOnce({ html: '<p>after retry</p>' });
      await act(async () => latest().emit('sandboxready'));
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(latest().resourceReady).toHaveLength(1);
      expect(latest().resourceReady[0].html).toBe('<p>after retry</p>');
    });

    it('treats empty html as a failure', async () => {
      mockFetchHtml.mockResolvedValue({ html: '' });
      const onFailed = jest.fn();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
      document.body.appendChild(iframe);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </RecoilRoot>
      );
      renderHook(
        () =>
          useAppBridge({
            iframeRef: { current: iframe },
            resource: makeResource(),
            toolArgs: undefined,
            toolResult: undefined,
            onSizeChanged: jest.fn(),
            onFailed,
          }),
        { wrapper },
      );
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(latest().resourceReady).toHaveLength(0);
      expect(onFailed).toHaveBeenCalled();
    });
  });

  describe('read-only views', () => {
    it('never resolves app html from the viewer server for a resourceUri-only app', async () => {
      mockReadOnly.mockReturnValue(true);
      const { iframe } = mountBridge(makeResource(), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).not.toHaveBeenCalled();
      expect(iframe.getAttribute('src')).toBeNull();
      expect(latest().resourceReady).toHaveLength(0);
    });

    it('runs inline html with no host-bound capabilities', async () => {
      mockReadOnly.mockReturnValue(true);
      mountBridge(makeResource({ text: '<p>inline</p>' }), client);
      await flush();
      await act(async () => latest().emit('sandboxready'));
      await flush();

      expect(mockFetchHtml).not.toHaveBeenCalled();
      expect(latest().resourceReady[0].html).toBe('<p>inline</p>');
      expect(latest().capabilities.serverTools).toBeUndefined();
      expect(latest().capabilities.openLinks).toEqual({});
    });
  });

  describe('openLink authorization', () => {
    let openSpy: jest.SpyInstance;

    beforeEach(() => {
      openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('denies a link before the sandbox document has any policy', async () => {
      let resolveHtml: (value: { html: string }) => void = () => {};
      mockFetchHtml.mockReturnValue(
        new Promise((resolve) => {
          resolveHtml = resolve;
        }) as ReturnType<typeof fetchMCPResourceHtml>,
      );
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://api.example.com/x' });
      });
      expect(openSpy).not.toHaveBeenCalled();
      await act(async () => {
        resolveHtml({ html: '<p>app</p>' });
        await Promise.resolve();
      });
    });

    it('refuses a link the tool-result copy grants but the delivered policy does not', async () => {
      mockFetchHtml.mockResolvedValue({
        html: '<p>app</p>',
        csp: { connectDomains: ['https://other.example'] },
      });
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://api.example.com/x' });
      });
      expect(openSpy).not.toHaveBeenCalled();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://other.example/x' });
      });
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        'https://other.example/x',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('denies every link when the declaration was too large to reach the response', async () => {
      const connectDomains = Array.from(
        { length: 400 },
        (_unused, index) => `https://host${index}.example.com`,
      );
      mockFetchHtml.mockResolvedValue({ html: '<p>app</p>', csp: { connectDomains } });
      const { iframe } = mountBridge(makeResource(), client);
      await flush();

      expect(new URL(iframe.src).searchParams.get('csp')).toBeNull();
      await act(async () => {
        await latest().onopenlink?.({ url: 'https://host0.example.com/x' });
      });
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('denies every link after a failed read', async () => {
      mockFetchHtml.mockRejectedValue(new Error('boom'));
      mountBridge(
        makeResource({
          csp: { connectDomains: ['https://api.example.com'] },
        } as Partial<UIResource>),
        client,
      );
      await flush();

      await act(async () => {
        await latest().onopenlink?.({ url: 'https://api.example.com/x' });
      });
      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    it('disposes the bridge and the theme observer on requestteardown', async () => {
      const onTeardown = jest.fn();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-sandbox-url', SANDBOX_URL);
      document.body.appendChild(iframe);
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </RecoilRoot>
      );
      renderHook(
        () =>
          useAppBridge({
            iframeRef: { current: iframe },
            resource: makeResource(),
            toolArgs: undefined,
            toolResult: undefined,
            onSizeChanged: jest.fn(),
            onTeardown,
          }),
        { wrapper },
      );
      await flush();

      const bridge = latest();
      await act(async () => bridge.emit('requestteardown'));
      await flush();

      expect(bridge.teardowns).toBeGreaterThan(0);
      expect(bridge.closed).toBe(true);
      expect(onTeardown).toHaveBeenCalled();

      await act(async () => {
        document.documentElement.classList.add('dark');
        await Promise.resolve();
      });
      expect(bridge.hostContextChanges).toHaveLength(0);
    });

    it('pushes theme changes to a live bridge', async () => {
      mountBridge(makeResource(), client);
      await flush();

      await act(async () => {
        document.documentElement.classList.add('dark');
        await Promise.resolve();
      });
      expect(latest().hostContextChanges).toHaveLength(1);
    });
  });

  describe('handshake payloads', () => {
    it('sends tool input before the tool result on initialize', async () => {
      mountBridge(makeResource(), client);
      await flush();
      await act(async () => {
        await latest().oninitialized?.();
      });
      expect(latest().toolInput).toEqual([{ arguments: { q: 1 } }]);
      expect(latest().toolResults).toEqual([{ content: [] }]);
    });
  });
});
