import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CodeBridgeFetch } from './bridge';
import {
  ATTACHED_WORKSPACE_BASH_SCHEMA,
  createAttachedWorkspaceBashTool,
  createGitIdentityProgrammaticBashTool,
} from './command';

describe('programmatic Bash Git identity', () => {
  test('applies authorship before the SDK sends a programmatic script', async () => {
    let receivedCode = '';
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      receivedCode = JSON.parse(body).code;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'completed', stdout: 'done', stderr: '', files: [] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const bashTool = createGitIdentityProgrammaticBashTool(
      { baseUrl: `http://127.0.0.1:${port}/v1`, authHeaders: () => ({}) },
      { name: "Agent O'Brien", email: 'agent@example.com' },
    );
    try {
      const invocationConfig = {
        tags: [],
        toolCall: { toolDefs: [] },
      };
      await bashTool.func(
        { code: 'git commit -m feature', tool_manifest: [] },
        undefined,
        invocationConfig,
      );
      expect(receivedCode).toContain(`GIT_AUTHOR_NAME='Agent O'"'"'Brien'`);
      expect(receivedCode).toContain("GIT_COMMITTER_EMAIL='agent@example.com'");
      expect(receivedCode).toContain('git commit -m feature');
      expect(receivedCode).not.toContain('git config');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});

function commandResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      protocolVersion: 1,
      operation: 'execute_command',
      workspaceId: 'primary',
      exitCode: 0,
      stdout: 'ready\n',
      stderr: '',
      truncated: false,
      timedOut: false,
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('createAttachedWorkspaceBashTool', () => {
  test('executes in the attached default workspace with per-user bridge authentication', async () => {
    const fetchImpl: CodeBridgeFetch = jest.fn(async () => commandResponse());
    const authHeaders = jest.fn().mockResolvedValue({
      Authorization: 'Bearer jwt',
      'X-LibreChat-Code-Worker-ID': 'user-worker',
    });
    const bashTool = createAttachedWorkspaceBashTool({
      baseUrl: 'https://code.example.com/v1/',
      authHeaders,
      fetchImpl,
    });

    await expect(bashTool.func({ command: 'pwd' }, undefined, {})).resolves.toEqual([
      'stdout:\nready\n\n[exit code: 0]',
      {},
    ]);

    expect(authHeaders).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://code.example.com/v1/workspace-tools/execute',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt',
          'X-LibreChat-Code-Worker-ID': 'user-worker',
        }),
      }),
    );
    const request = JSON.parse(String((fetchImpl as jest.Mock).mock.calls[0][1]?.body));
    expect(request).toEqual({
      protocolVersion: 1,
      operation: 'execute_command',
      workspaceId: 'primary',
      command: 'pwd',
      maxOutputBytes: 256 * 1024,
    });
  });

  test('validates and invokes commands through the LangChain tool runtime', async () => {
    const fetchImpl: CodeBridgeFetch = jest.fn(async () => commandResponse());
    const bashTool = createAttachedWorkspaceBashTool({
      baseUrl: 'https://code.example.com/v1',
      authHeaders: () => ({}),
      fetchImpl,
    });

    await expect(bashTool.invoke({ command: 'pwd' })).resolves.toBeDefined();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      Object.getOwnPropertyDescriptor(ATTACHED_WORKSPACE_BASH_SCHEMA, '__absolute_uri__'),
    ).toBeUndefined();
  });

  test('preserves legacy positional args without interpolating shell metacharacters', async () => {
    const fetchImpl: CodeBridgeFetch = jest.fn(async () => commandResponse());
    const bashTool = createAttachedWorkspaceBashTool({
      baseUrl: 'https://code.example.com/v1',
      authHeaders: () => ({}),
      fetchImpl,
    });

    await bashTool.func({ command: 'printf "%s" "$1"', args: ["a'b; echo unsafe"] }, undefined, {});

    const request = JSON.parse(String((fetchImpl as jest.Mock).mock.calls[0][1]?.body));
    expect(request.command).toBe(`bash -c 'printf "%s" "$1"' -- 'a'"'"'b; echo unsafe'`);
  });

  test('injects the configured agent Git identity without writing machine Git configuration', async () => {
    const fetchImpl: CodeBridgeFetch = jest.fn(async () => commandResponse());
    const bashTool = createAttachedWorkspaceBashTool({
      baseUrl: 'https://code.example.com/v1',
      authHeaders: () => ({}),
      gitIdentity: { name: "Agent O'Brien", email: 'agent@example.com' },
      fetchImpl,
    });

    await bashTool.func({ command: 'git commit -m "Implement feature"' }, undefined, {});

    const request = JSON.parse(String((fetchImpl as jest.Mock).mock.calls[0][1]?.body));
    expect(request.command).toBe(
      `export GIT_AUTHOR_NAME='Agent O'"'"'Brien' GIT_AUTHOR_EMAIL='agent@example.com' GIT_COMMITTER_NAME='Agent O'"'"'Brien' GIT_COMMITTER_EMAIL='agent@example.com'; git commit -m "Implement feature"`,
    );
    expect(request.command).not.toContain('git config');
  });

  test('reports termination, timeouts, and truncation without hiding stderr', async () => {
    const fetchImpl: CodeBridgeFetch = jest.fn(async () =>
      commandResponse({
        exitCode: null,
        signal: 'SIGKILL',
        stdout: '',
        stderr: 'deadline reached',
        truncated: true,
        timedOut: true,
      }),
    );
    const bashTool = createAttachedWorkspaceBashTool({
      baseUrl: 'https://code.example.com/v1',
      authHeaders: () => ({}),
      fetchImpl,
    });

    await expect(bashTool.func({ command: 'sleep 60' }, undefined, {})).resolves.toEqual([
      'stderr:\ndeadline reached\n[terminated by SIGKILL][timed out][output truncated]',
      {},
    ]);
  });
});
