import type { CodeBridgeFetch } from './bridge';
import { executeWorkspaceTool } from './workspace';

describe('executeWorkspaceTool', () => {
  test('sends an authenticated bounded read to the selected attached worker', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
          content: 'const ready = true;',
          startLine: 1,
          endLine: 1,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1/',
        authHeaders: {
          Authorization: 'Bearer jwt',
          'X-LibreChat-Code-Worker-ID': 'user-worker',
        },
        request: {
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
          startLine: 1,
          maxLines: 200,
        },
        fetchImpl,
      }),
    ).resolves.toMatchObject({ content: 'const ready = true;' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.example.com/v1/workspace-tools/execute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt',
          'Content-Type': 'application/json',
          'X-LibreChat-Code-Worker-ID': 'user-worker',
        }),
      }),
    );
  });

  test('combines the caller abort signal with the workspace request timeout', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchImpl: CodeBridgeFetch = jest.fn(async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Response(
        JSON.stringify({
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'notes.txt',
          content: 'ready',
          startLine: 1,
          endLine: 1,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await executeWorkspaceTool({
      baseURL: 'https://code.example.com/v1',
      authHeaders: { Authorization: 'Bearer jwt' },
      signal: controller.signal,
      request: {
        protocolVersion: 1,
        operation: 'read_file',
        workspaceId: 'primary',
        path: 'notes.txt',
      },
      fetchImpl,
    });

    expect(requestSignal?.aborted).toBe(false);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });

  test('preserves caller cancellation instead of relabeling it as a transport failure', async () => {
    const controller = new AbortController();
    const fetchImpl: CodeBridgeFetch = jest.fn(
      async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );

    const request = executeWorkspaceTool({
      baseURL: 'https://code.example.com/v1',
      authHeaders: { Authorization: 'Bearer jwt' },
      signal: controller.signal,
      request: {
        protocolVersion: 1,
        operation: 'read_file',
        workspaceId: 'primary',
        path: 'notes.txt',
      },
      fetchImpl,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('preserves caller cancellation while reading the response body', async () => {
    const controller = new AbortController();
    const fetchImpl: CodeBridgeFetch = jest.fn(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          init?.signal?.addEventListener(
            'abort',
            () => streamController.error(init.signal?.reason),
            { once: true },
          );
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const request = executeWorkspaceTool({
      baseURL: 'https://code.example.com/v1',
      authHeaders: { Authorization: 'Bearer jwt' },
      signal: controller.signal,
      request: {
        protocolVersion: 1,
        operation: 'read_file',
        workspaceId: 'primary',
        path: 'notes.txt',
      },
      fetchImpl,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('rejects a malformed worker result before it reaches the model', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: '/Users/operator/.ssh/id_ed25519',
          content: 'secret',
          startLine: 1,
          endLine: 1,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1',
        authHeaders: { Authorization: 'Bearer jwt' },
        request: {
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('rejects read content that exceeds its declared line range', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
          content: 'first\nsecond',
          startLine: 1,
          endLine: 1,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1',
        authHeaders: { Authorization: 'Bearer jwt' },
        request: {
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
          maxLines: 1,
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('rejects unexpected result fields that could disclose worker metadata', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
          content: 'safe',
          startLine: 1,
          endLine: 1,
          truncated: false,
          root: '/Users/operator/private',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1',
        authHeaders: { Authorization: 'Bearer jwt' },
        request: {
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' });
  });

  test('surfaces bounded upstream failures without returning their body', async () => {
    const cancel = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          cancel,
        }),
        { status: 503 },
      ),
    );

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1',
        authHeaders: { Authorization: 'Bearer jwt' },
        request: {
          protocolVersion: 1,
          operation: 'search_text',
          workspaceId: 'primary',
          query: 'needle',
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'rejected', upstreamStatus: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('rejects an oversized response before parsing worker-controlled JSON', async () => {
    const json = jest.fn().mockResolvedValue({
      protocolVersion: 1,
      operation: 'read_file',
      workspaceId: 'primary',
      path: 'src/app.ts',
      content: 'safe',
      startLine: 1,
      endLine: 1,
      truncated: false,
    });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Length': String(5 * 1024 * 1024) }),
      json,
    } as unknown as Response);

    await expect(
      executeWorkspaceTool({
        baseURL: 'https://code.example.com/v1',
        authHeaders: { Authorization: 'Bearer jwt' },
        request: {
          protocolVersion: 1,
          operation: 'read_file',
          workspaceId: 'primary',
          path: 'src/app.ts',
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' });
    expect(json).not.toHaveBeenCalled();
  });
});
