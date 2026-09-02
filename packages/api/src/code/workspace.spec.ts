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
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('internal details', { status: 503 }));

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
