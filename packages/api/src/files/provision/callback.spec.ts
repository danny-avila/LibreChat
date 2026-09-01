import { Constants } from '@librechat/agents';
import { EToolResources, FileContext } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ProvisionState } from '~/agents/resources';
import type { ProvisionToolContext } from './callback';
import type { ServerRequest } from '~/types';
import { createProvisionFilesCallback } from './callback';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const req = { user: { id: 'user-1' } } as ServerRequest;

function makeFile(overrides: Partial<TFile> = {}): TFile {
  return {
    file_id: 'file-1',
    filename: 'data.csv',
    filepath: '/uploads/data.csv',
    type: 'text/csv',
    user: 'user-1',
    object: 'file',
    bytes: 10,
    embedded: false,
    usage: 0,
    context: FileContext.message_attachment,
    ...overrides,
  } as TFile;
}

function state(
  codeEnvFiles: TFile[],
  vectorDBFiles: TFile[],
  agentScopedFileIds: string[] = [],
): ProvisionState {
  return {
    codeEnvFiles,
    vectorDBFiles,
    aliveFileIds: new Set<string>(),
    agentScopedFileIds: new Set(agentScopedFileIds),
  };
}

function buildHarness({
  contexts,
  codeImpl,
  vectorImpl,
}: {
  contexts: Array<[string, ProvisionToolContext]>;
  codeImpl?: jest.Mock;
  vectorImpl?: jest.Mock;
}) {
  const provisionToCodeEnv =
    codeImpl ??
    jest.fn(async ({ file }: { file: TFile }) => ({
      referenceSet: {
        codeEnvRefs: {
          default: {
            kind: 'user',
            id: 'u1',
            storage_session_id: 'sess-1',
            file_id: 'remote-1',
          },
        },
      },
      refUpdate: {
        file_id: file.file_id,
        routeKey: 'default',
        ref: { kind: 'user', id: 'u1', storage_session_id: 'sess-1', file_id: 'remote-1' },
      },
    }));
  const provisionToVectorDB =
    vectorImpl ??
    jest.fn(async ({ file }: { file: TFile }) => ({
      embedded: true,
      fileUpdate: { file_id: file.file_id, embedded: true },
    }));
  const updateFile = jest.fn(async () => ({}));
  const updateCodeEnvRef = jest.fn(async () => ({}));
  const addEmbeddedEntity = jest.fn(async () => ({}));
  const agentToolContexts = new Map<string, ProvisionToolContext>(contexts);

  return {
    provisionToCodeEnv,
    provisionToVectorDB,
    updateFile,
    updateCodeEnvRef,
    addEmbeddedEntity,
    agentToolContexts,
    provisionFiles: createProvisionFilesCallback({
      req,
      agentToolContexts,
      provisionToCodeEnv: provisionToCodeEnv as never,
      provisionToVectorDB: provisionToVectorDB as never,
      updateFile,
      updateCodeEnvRef,
      addEmbeddedEntity,
    }),
  };
}

describe('createProvisionFilesCallback', () => {
  it('scopes only the agent own resource files to its identity', async () => {
    /* A user can attach another agent's setup file to this conversation. Uploading it under
     * this agent would place it in a namespace this agent's other users share, so the
     * upload identity comes from membership in this agent's resources. */
    const own = makeFile({ file_id: 'own-file', context: FileContext.agents });
    const foreign = makeFile({ file_id: 'foreign-file', context: FileContext.agents });
    const { provisionFiles, provisionToCodeEnv } = buildHarness({
      contexts: [['agent-a', { provisionState: state([own, foreign], [], ['own-file']) }]],
    });

    await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');

    const byFile = new Map(
      provisionToCodeEnv.mock.calls.map(([args]) => [
        (args as { file: TFile }).file.file_id,
        (args as { entity_id?: string }).entity_id,
      ]),
    );
    expect(byFile.get('own-file')).toBe('agent-a');
    expect(byFile.get('foreign-file')).toBeUndefined();
  });

  it('provisions once for the request when two agents queue the same file', async () => {
    const shared = makeFile();
    const contexts: Array<[string, ProvisionToolContext]> = [
      ['agent-a', { provisionState: state([{ ...shared }], []) }],
      ['agent-b', { provisionState: state([{ ...shared }], []) }],
    ];
    const { provisionFiles, provisionToCodeEnv, agentToolContexts } = buildHarness({ contexts });

    await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');
    await provisionFiles([Constants.EXECUTE_CODE], 'agent-b');

    expect(provisionToCodeEnv).toHaveBeenCalledTimes(1);
    for (const agentId of ['agent-a', 'agent-b']) {
      const ctx = agentToolContexts.get(agentId);
      const files = (ctx?.tool_resources as Record<string, { files?: TFile[] }>)[
        EToolResources.execute_code
      ]?.files;
      expect(files?.[0]?.metadata).toMatchObject({
        codeEnvRefs: { default: { file_id: 'remote-1' } },
      });
      expect(ctx?.provisionState?.codeEnvFiles).toHaveLength(0);
    }
  });

  it('returns the provisioned refs so the batch can inject them', async () => {
    const { provisionFiles } = buildHarness({
      contexts: [['agent-a', { provisionState: state([makeFile()], []) }]],
    });

    const provisioned = await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');

    expect(provisioned).toEqual([
      {
        id: 'remote-1',
        resource_id: 'u1',
        storage_session_id: 'sess-1',
        name: 'data.csv',
        kind: 'user',
      },
    ]);
  });

  it('returns the refs to every agent sharing one upload', async () => {
    const shared = makeFile();
    const { provisionFiles } = buildHarness({
      contexts: [
        ['agent-a', { provisionState: state([{ ...shared }], []) }],
        ['agent-b', { provisionState: state([{ ...shared }], []) }],
      ],
    });

    const first = await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');
    const second = await provisionFiles([Constants.EXECUTE_CODE], 'agent-b');

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('persists the shared provisioning result once', async () => {
    const shared = makeFile();
    const { provisionFiles, updateCodeEnvRef } = buildHarness({
      contexts: [
        ['agent-a', { provisionState: state([{ ...shared }], []) }],
        ['agent-b', { provisionState: state([{ ...shared }], []) }],
      ],
    });

    await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');
    await provisionFiles([Constants.EXECUTE_CODE], 'agent-b');

    expect(updateCodeEnvRef).toHaveBeenCalledTimes(1);
  });

  it('holds every waiter until the shared reference is persisted', async () => {
    let releaseWrite: () => void = () => undefined;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const shared = makeFile();
    const harness = buildHarness({
      contexts: [
        ['agent-a', { provisionState: state([{ ...shared }], []) }],
        ['agent-b', { provisionState: state([{ ...shared }], []) }],
      ],
    });
    const events: string[] = [];
    harness.updateCodeEnvRef.mockImplementation(async () => {
      await writeGate;
      events.push('write');
      return {};
    });

    const waiterA = harness
      .provisionFiles([Constants.EXECUTE_CODE], 'agent-a')
      .then(() => events.push('a'));
    const waiterB = harness
      .provisionFiles([Constants.EXECUTE_CODE], 'agent-b')
      .then(() => events.push('b'));

    /* Drains every pending microtask, so anything that could return without the write
     * already has by the time this resolves. */
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual([]);

    releaseWrite();
    await Promise.all([waiterA, waiterB]);

    expect(events[0]).toBe('write');
    expect(events).toHaveLength(3);
    expect(harness.updateCodeEnvRef).toHaveBeenCalledTimes(1);
  });

  it('aborts the turn when the reference cannot be persisted', async () => {
    const harness = buildHarness({
      contexts: [['agent-a', { provisionState: state([makeFile()], []) }]],
    });
    harness.updateCodeEnvRef.mockRejectedValue(new Error('mongo down'));

    await expect(harness.provisionFiles([Constants.EXECUTE_CODE], 'agent-a')).rejects.toThrow(
      /aborting tool execution rather than running without them/,
    );
    expect(harness.updateCodeEnvRef).toHaveBeenCalledTimes(2);
  });

  it('uploads separately when the agents resolve different code deployments', async () => {
    const shared = makeFile();
    const { provisionFiles, provisionToCodeEnv } = buildHarness({
      contexts: [
        ['agent-a', { provisionState: state([{ ...shared }], []) }],
        [
          'agent-b',
          {
            provisionState: state([{ ...shared }], []),
            codeExecutionContext: { executionProfile: 'stateful', executionRouteKey: 'stateful:x' },
          },
        ],
      ],
    });

    await provisionFiles([Constants.EXECUTE_CODE], 'agent-a');
    await provisionFiles([Constants.EXECUTE_CODE], 'agent-b');

    expect(provisionToCodeEnv).toHaveBeenCalledTimes(2);
  });

  it('shares embedding work across agents queueing the same search file', async () => {
    const shared = makeFile();
    const { provisionFiles, provisionToVectorDB, addEmbeddedEntity } = buildHarness({
      contexts: [
        ['agent-a', { provisionState: state([], [{ ...shared }]) }],
        ['agent-b', { provisionState: state([], [{ ...shared }]) }],
      ],
    });

    await Promise.all([
      provisionFiles(['file_search'], 'agent-a'),
      provisionFiles(['file_search'], 'agent-b'),
    ]);

    expect(provisionToVectorDB).toHaveBeenCalledTimes(1);
    /* Unscoped vectors land in the requesting user's namespace, so that is what gets
     * recorded. Without it the file reads as unembedded and re-embeds every turn. */
    expect(addEmbeddedEntity).toHaveBeenCalledTimes(1);
    expect(addEmbeddedEntity).toHaveBeenCalledWith({
      file_id: shared.file_id,
      entityId: 'user-1',
    });
  });

  it('retries a failed upload on a later tool call instead of replaying the rejection', async () => {
    let attempts = 0;
    const codeImpl = jest.fn(async ({ file }: { file: TFile }) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('code api unreachable');
      }
      return {
        referenceSet: {
          codeEnvRefs: {
            default: {
              kind: 'user',
              id: 'u1',
              storage_session_id: 'sess-1',
              file_id: 'remote-1',
            },
          },
        },
        refUpdate: {
          file_id: file.file_id,
          routeKey: 'default',
          ref: { kind: 'user', id: 'u1', storage_session_id: 'sess-1', file_id: 'remote-1' },
        },
      };
    });
    const { provisionFiles, agentToolContexts } = buildHarness({
      contexts: [['agent-a', { provisionState: state([makeFile()], []) }]],
      codeImpl,
    });

    await expect(provisionFiles([Constants.EXECUTE_CODE], 'agent-a')).rejects.toThrow(
      /Failed to provision/,
    );
    expect(agentToolContexts.get('agent-a')?.provisionState?.codeEnvFiles).toHaveLength(1);

    await expect(provisionFiles([Constants.EXECUTE_CODE], 'agent-a')).resolves.toHaveLength(1);
    expect(codeImpl).toHaveBeenCalledTimes(2);
  });

  it('treats a declined embedding as a failure rather than a result', async () => {
    /* The service resolves with embedded false when the vector store declines the file.
     * That means the vectors are absent just as a throw does, so the file has to stay
     * queued instead of search proceeding without it. */
    const vectorImpl = jest.fn(async () => ({ embedded: false, fileUpdate: null }));
    const { provisionFiles, agentToolContexts } = buildHarness({
      contexts: [['agent-a', { provisionState: state([], [makeFile()]) }]],
      vectorImpl,
    });

    await expect(provisionFiles(['file_search'], 'agent-a')).rejects.toThrow(
      /aborting tool execution rather than searching without them/,
    );
    expect(agentToolContexts.get('agent-a')?.provisionState?.vectorDBFiles).toHaveLength(1);
  });

  it('aborts the turn when search provisioning fails', async () => {
    const vectorImpl = jest.fn(async () => {
      throw new Error('rag unreachable');
    });
    const { provisionFiles, agentToolContexts } = buildHarness({
      contexts: [['agent-a', { provisionState: state([], [makeFile()]) }]],
      vectorImpl,
    });

    await expect(provisionFiles(['file_search'], 'agent-a')).rejects.toThrow(
      /aborting tool execution rather than searching without them/,
    );
    expect(agentToolContexts.get('agent-a')?.provisionState?.vectorDBFiles).toHaveLength(1);
  });

  it('ignores tool batches that need neither code nor search', async () => {
    const { provisionFiles, provisionToCodeEnv, provisionToVectorDB } = buildHarness({
      contexts: [['agent-a', { provisionState: state([makeFile()], [makeFile()]) }]],
    });

    await provisionFiles(['web_search'], 'agent-a');

    expect(provisionToCodeEnv).not.toHaveBeenCalled();
    expect(provisionToVectorDB).not.toHaveBeenCalled();
  });
});
