import { createHash } from 'node:crypto';
import type { CodeExecutionContext } from '~/agents/execution';
import { createRepositoryInstructionLoader } from './instructions';

const content = 'Use the project test command.\n';
const sha256 = createHash('sha256').update(content).digest('hex');
const context: CodeExecutionContext = {
  baseUrl: 'https://code.example/v1',
  codeSessionKey: 'session',
  executionProfile: 'stateful',
  statefulSessions: true,
  environmentType: 'attached',
  environmentId: 'machine',
  bridgeWorkerId: 'worker',
  codeWorkspace: {
    environmentId: 'machine',
    workspaceId: 'primary',
    operations: ['read_file'],
    instructions: [
      { path: 'AGENTS.md', bytes: Buffer.byteLength(content), sha256, truncated: false },
    ],
  },
};
const response = () =>
  new Response(
    JSON.stringify({
      protocolVersion: 1,
      operation: 'read_file',
      workspaceId: 'primary',
      path: 'AGENTS.md',
      content,
      startLine: 1,
      endLine: 2,
      truncated: false,
    }),
    { status: 200 },
  );

describe('repository instruction loading', () => {
  it('checks authorization and content policy on cache hits, without cross-principal reuse', async () => {
    const load = createRepositoryInstructionLoader();
    const fetchImpl = jest.fn(async () => response());
    const authHeaders = jest.fn(async () => ({ Authorization: 'Bearer test' }));
    const assertContent = jest.fn();
    const input = {
      enabled: true,
      context,
      principalId: 'alice',
      fetchImpl,
      authHeaders,
      assertContent,
    };
    const first = await load(input);
    expect(first).toContain('Use the project test command.');
    expect(await load(input)).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(authHeaders).toHaveBeenCalledTimes(2);
    expect(assertContent).toHaveBeenCalledTimes(2);
    await load({ ...input, principalId: 'bob' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await load({ ...input, mode: 'off' })).toBeUndefined();
    expect(await load({ ...input, enabled: false })).toBeUndefined();
    expect(await load({ ...input, mode: 'defer' })).toContain('unless they conflict');
  });

  it('omits changed, missing and unauthorized instruction snapshots', async () => {
    const load = createRepositoryInstructionLoader();
    const input = {
      enabled: true,
      context,
      principalId: 'alice',
      authHeaders: async () => ({}),
      assertContent: jest.fn(),
    };
    expect(
      await load({ ...input, fetchImpl: async () => new Response('{}', { status: 404 }) }),
    ).toBeUndefined();
    expect(
      await load({
        ...input,
        context: {
          ...context,
          codeWorkspace: {
            ...context.codeWorkspace!,
            instructions: [{ ...context.codeWorkspace!.instructions![0], sha256: 'a'.repeat(64) }],
          },
        },
        fetchImpl: async () => response(),
      }),
    ).toBeUndefined();
    expect(
      await load({
        ...input,
        context: { ...context, codeWorkspace: { ...context.codeWorkspace!, operations: [] } },
      }),
    ).toBeUndefined();
  });
});
