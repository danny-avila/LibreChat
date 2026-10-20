import { Constants } from '@librechat/agents';
import {
  AgentCapabilities,
  EToolResources,
  FileContext,
  FileSources,
  configSchema,
} from 'librechat-data-provider';
import type { CodeEnvFile, SubagentExecutionContext } from '@librechat/agents';
import type { Agent, CodeEnvRef, TFile } from 'librechat-data-provider';
import type { ProvisionCallbackDeps } from '~/files/provision/callback';
import type { RunFileSessionDeps } from './session';
import type { RunFileToolContext } from './host';
import type { ServerRequest } from '~/types';
import { getTurnCodeEnvRef, saveCodeFileReference } from '~/files/code/references';
import { createRunFileHost, resolveRunFileCodeExecutionContext } from './host';
import { getProjectCodeScope, selectCodeFiles } from '~/files/code/priming';
import { mergeCodeFilesIntoContext } from '~/agents/codeFilesSession';
import { sanitizeArtifactPath } from '~/utils/files';
import * as sessionModule from './session';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

function file(id: string, overrides: Partial<TFile> = {}): TFile {
  return {
    file_id: id,
    filename: `${id}.csv`,
    filepath: `/uploads/${id}.csv`,
    user: 'user',
    tenantId: 'tenant',
    type: 'text/csv',
    bytes: 12,
    embedded: false,
    object: 'file',
    usage: 0,
    source: FileSources.local,
    context: FileContext.message_attachment,
    llmDeliveryPath: 'none',
    metadata: { destinationChosen: false },
    ...overrides,
  };
}

function identity(id = 'child'): SubagentExecutionContext {
  return {
    rootRunId: 'run',
    hookSessionId: 'run',
    depth: 1,
    ancestry: [
      {
        subagentRunId: id,
        subagentType: 'worker',
        subagentKind: 'agent',
        subagentAgentId: 'worker',
        parentRunId: 'run',
        parentAgentId: 'parent',
        parentToolCallId: `spawn-${id}`,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness(
  options: {
    inputs?: TFile[];
    setup?: TFile[];
    rootFiles?: TFile[];
    rootSeed?: CodeEnvFile[];
    hasEntityEmbeddings?: jest.Mock;
    adoptLegacySearchEmbeddings?: jest.Mock;
    getCodeFileInfo?: NonNullable<ProvisionCallbackDeps['getCodeFileInfo']>;
    publicationBytes?: number;
  } = {},
) {
  const input = options.inputs ?? [file('input')];
  const setup = options.setup ?? [file('worker-setup', { context: FileContext.agents })];
  const parsed = configSchema.parse({
    version: '1.3.9',
    endpoints: {
      agents: {
        capabilities: [AgentCapabilities.context],
        fileSharing: { enabled: true },
      },
    },
  });
  const req = {
    user: { id: 'user', tenantId: 'tenant', role: 'USER' },
    config: { endpoints: { agents: parsed.endpoints?.agents } },
  } as ServerRequest;
  const agent = (id: string): Agent =>
    ({
      id,
      name: id,
      provider: 'openAI',
      model: 'gpt-4o',
      tools: [Constants.EXECUTE_CODE, EToolResources.file_search, EToolResources.context],
      tool_resources:
        id === 'worker'
          ? {
              execute_code: { file_ids: setup.map((entry) => entry.file_id) },
              file_search: { file_ids: setup.map((entry) => entry.file_id) },
            }
          : undefined,
      subagents: { enabled: true, shareFiles: true, allowSelf: false, agent_ids: ['worker'] },
    }) as Agent;
  const contexts = new Map<string, RunFileToolContext>(
    ['parent', 'worker'].map((id) => [
      id,
      {
        agent: agent(id),
        codeEnvAvailable: true,
        primedCodeFiles: id === 'parent' ? options.rootSeed : undefined,
        // Base initialization may contain historical runtime resources. Only persisted
        // setup membership and this run's manifest may reach an execution host.
        tool_resources: {
          execute_code: {
            files:
              id === 'parent' ? (options.rootFiles ?? [file('historical')]) : [file('historical')],
          },
        },
        codeExecutionContext: {
          baseUrl: 'https://code.example',
          executionProfile: 'stateful',
          executionRouteKey: 'managed-worker',
          environmentType: 'managed',
          codeSessionKey: 'base-agent-session',
          runtimeSessionHint: 'base-agent-session',
          statefulSessions: true,
        },
      },
    ]),
  );
  const loadFiles = jest.fn(async (_ids: string[]) => structuredClone(setup));
  const filterFiles = jest.fn(async ({ files }: { files: TFile[] }) => files);
  const saved: TFile[] = [];
  const publicationNames = new Map<string, string>();
  const listPublications = jest.fn(async () => structuredClone(saved));
  const publish = jest.fn<
    ReturnType<RunFileSessionDeps['publish']>,
    Parameters<RunFileSessionDeps['publish']>
  >(async ({ scope, artifact, provenance }) => {
    const ref: CodeEnvRef = {
      kind: 'user',
      id: scope.userId,
      storage_session_id: artifact.sessionId,
      file_id: artifact.id,
    };
    publicationNames.set(JSON.stringify([ref.storage_session_id, ref.file_id]), artifact.name);
    const published = file(`published-${provenance.sourceFileId}`, {
      filename: sanitizeArtifactPath(artifact.name),
      bytes: options.publicationBytes ?? 12,
      conversationId: scope.conversationId,
      context: FileContext.run_artifact,
      metadata: {
        destinationChosen: false,
        runFile: provenance,
        codeEnvRefs: { 'managed-worker': ref },
      },
    });
    saved.push(published);
    return structuredClone(published);
  });
  type CodeProvision = ProvisionCallbackDeps['provisionToCodeEnv'];
  const codeResult = ({
    file: candidate,
    entity_id,
    sandboxFilename,
    route,
  }: Parameters<CodeProvision>[0]): Awaited<ReturnType<CodeProvision>> => {
    const routeKey = route?.executionRouteKey ?? route?.executionProfile ?? 'default';
    const ref: CodeEnvRef = {
      kind: entity_id ? 'agent' : 'user',
      id: entity_id ?? 'user',
      file_id: `remote-${candidate.file_id}`,
      storage_session_id: `storage-${entity_id ?? 'user'}`,
      sandboxFilename,
    };
    return {
      referenceSet: { codeEnvRefs: { [routeKey]: ref } },
      refUpdate: { file_id: candidate.file_id, routeKey, ref },
      sandboxFilename: sandboxFilename ?? candidate.filename,
    };
  };
  const provisionToCodeEnv = jest.fn<ReturnType<CodeProvision>, Parameters<CodeProvision>>(
    async (params) => codeResult(params),
  );
  const provisionToVectorDB = jest.fn<
    ReturnType<ProvisionCallbackDeps['provisionToVectorDB']>,
    Parameters<ProvisionCallbackDeps['provisionToVectorDB']>
  >(async ({ file: candidate }) => ({
    embedded: true,
    fileUpdate: { file_id: candidate.file_id, embedded: true },
  }));
  const updateCodeEnvRef = jest.fn<
    ReturnType<ProvisionCallbackDeps['updateCodeEnvRef']>,
    Parameters<ProvisionCallbackDeps['updateCodeEnvRef']>
  >(async () => undefined);
  const addEmbeddedEntity = jest.fn(async () => undefined);
  const getCodeFileInfo = jest.fn<
    ReturnType<NonNullable<ProvisionCallbackDeps['getCodeFileInfo']>>,
    Parameters<NonNullable<ProvisionCallbackDeps['getCodeFileInfo']>>
  >(
    options.getCodeFileInfo ??
      (async (ref) => ({
        lastModified: new Date().toISOString(),
        originalFilename:
          ref.sandboxFilename ??
          publicationNames.get(JSON.stringify([ref.storage_session_id, ref.file_id])),
      })),
  );
  const emit = jest.fn(async () => undefined);
  const encodeMessages = jest.fn(async () => []);
  const spy = jest.spyOn(sessionModule, 'createRunFileSession');
  const host = createRunFileHost({
    req,
    contexts,
    createdAt: Date.now(),
    inputFileIds: new Set(input.map((entry) => entry.file_id)),
    getInputs: () => [...input, file('foreign-history', { user: 'other' })],
    loadFiles,
    filterFiles,
    listPublications,
    snapshots: {
      capture: jest.fn(async () => ({ snapshotId: 'private-output', size: 12, sha256: 'hash' })),
      discard: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    },
    publish,
    emit,
    validateMessages: jest.fn(),
    encodeMessages,
    provisioning: {
      provisionToCodeEnv,
      provisionToVectorDB,
      updateCodeEnvRef,
      updateFile: jest.fn(async () => undefined),
      addEmbeddedEntity,
      getCodeFileInfo,
      hasEntityEmbeddings: options.hasEntityEmbeddings,
      adoptLegacySearchEmbeddings: options.adoptLegacySearchEmbeddings,
    },
  });
  const deps = spy.mock.calls[spy.mock.calls.length - 1][0];
  host.session.activate('run', 'conversation', ['parent']);
  const signal = new AbortController().signal;
  const prepare = (context = identity(), suppliedSignal = signal) =>
    host.session.prepare({
      executionContext: context,
      memberAgentIds: ['worker'],
      signal: suppliedSignal,
      resumed: false,
    });
  const publishOutput = async (context = identity(), id = 'output') => {
    await host.session.capture(
      'worker',
      context,
      `tool-${id}`,
      {
        session_id: `private-${context.ancestry[0].subagentRunId}`,
        files: [{ id, name: `${id}.csv` }],
      },
      host.getContext('worker', context)?.codeExecutionContext,
    );
    const artifact = (await host.session.list('worker', context)).artifacts.find(
      (entry) => entry.filename === `${id}.csv`,
    );
    if (!artifact) throw new Error('Expected staged artifact');
    return host.session.publish('worker', context, artifact.artifact_id, [], signal);
  };
  return {
    host,
    deps,
    req,
    contexts,
    input,
    setup,
    saved,
    signal,
    prepare,
    publishOutput,
    loadFiles,
    filterFiles,
    publish,
    emit,
    encodeMessages,
    listPublications,
    provisionToCodeEnv,
    provisionToVectorDB,
    updateCodeEnvRef,
    addEmbeddedEntity,
    getCodeFileInfo,
    codeResult,
  };
}

describe('run file execution host', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'reuses seeded root files when metadata checks fail (project code=%s)',
    async (projectCode) => {
      const live = file('live', {
        filename: 'results.csv',
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              file_id: 'live-remote',
              storage_session_id: 'live-store',
              sandboxFilename: 'results.csv',
            },
          },
        },
      });
      const h = harness({
        inputs: [],
        setup: [],
        rootFiles: [live],
        rootSeed: [
          {
            id: 'live-remote',
            resource_id: 'user',
            kind: 'user',
            storage_session_id: 'live-store',
            name: 'results.csv',
          },
        ],
        getCodeFileInfo: async () => null,
      });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: projectCode },
      }).projects;
      const root = h.contexts.get('parent')!;
      root.provisionState = {
        codeEnvFiles: [],
        vectorDBFiles: [],
        aliveFileIds: new Set([live.file_id]),
        agentScopedFileIds: new Set(),
      };
      h.provisionToCodeEnv.mockRejectedValue(new Error('Code API unavailable'));
      await h.host.session.prepareTools('parent', undefined, h.signal, 'snapshot');
      expect(await h.host.provisionPrepared(['bash_tool'], 'parent', h.signal)).toBeUndefined();
      expect(await h.host.provisionPrepared(['bash_tool'], 'parent', h.signal)).toBeUndefined();
      expect(h.getCodeFileInfo).not.toHaveBeenCalled();
      expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
      expect(h.updateCodeEnvRef).not.toHaveBeenCalled();
      await h.host.session.close();
    },
  );

  it.each([
    { projectCode: false, privateUpload: false },
    { projectCode: true, privateUpload: false },
    { projectCode: false, privateUpload: true },
    { projectCode: true, privateUpload: true },
  ])(
    'keeps the newest seeded output over an older upload (project code=$projectCode, private=$privateUpload)',
    async ({ projectCode, privateUpload }) => {
      const uploadContext = privateUpload ? FileContext.agents : FileContext.message_attachment;
      const records = ['upload', 'output'].map((id, index) =>
        file(id, {
          filename: 'results.csv',
          conversationId: 'conversation',
          context: index === 1 ? FileContext.execute_code : uploadContext,
          createdAt: new Date(index + 1),
          metadata: {
            codeEnvRefs: {
              'managed-worker': {
                kind: index === 0 && privateUpload ? 'agent' : 'user',
                id: index === 0 && privateUpload ? 'parent' : 'user',
                file_id: `${id}-remote`,
                storage_session_id: `${id}-store`,
                sandboxFilename: 'results.csv',
              },
            },
          },
        }),
      );
      const seed: CodeEnvFile[] = [
        {
          id: 'output-remote',
          resource_id: 'user',
          kind: 'user',
          storage_session_id: 'output-store',
          name: 'results.csv',
        },
      ];
      const h = harness({
        inputs: [],
        setup: [],
        rootFiles: records,
        rootSeed: seed,
        getCodeFileInfo: async (ref) =>
          ref.file_id === 'output-remote' ? null : { lastModified: new Date().toISOString() },
      });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: projectCode },
      }).projects;
      h.req.body = { conversationId: 'conversation' };
      const privateFileIds = new Set(privateUpload ? ['upload'] : []);
      const initial = await selectCodeFiles({
        files: records,
        privateFileIds,
        routeKey: 'managed-worker',
        getFileInfo: async () => ({ lastModified: new Date().toISOString() }),
      });
      expect(initial.selected.map((entry) => entry.file.file_id)).toEqual(['output']);
      const root = h.contexts.get('parent')!;
      root.provisionState = {
        codeEnvFiles: [],
        vectorDBFiles: [],
        aliveFileIds: new Set(['upload', 'output']),
        agentScopedFileIds: privateFileIds,
      };
      h.provisionToCodeEnv.mockRejectedValue(new Error('Code API unavailable'));
      try {
        await h.host.session.prepareTools('parent', undefined, h.signal, 'snapshot');
        for (let attempt = 0; attempt < 2; attempt++) {
          const delivered = await h.host.provisionPrepared(['bash_tool'], 'parent', h.signal);
          expect(delivered).toBeUndefined();
          const prior = { session_id: 'root', files: seed };
          const merged = mergeCodeFilesIntoContext(prior, delivered) ?? prior;
          expect(merged.files).toEqual(seed);
        }
        expect(h.getCodeFileInfo.mock.calls.every(([ref]) => ref.file_id === 'upload-remote')).toBe(
          true,
        );
        expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
        expect(h.updateCodeEnvRef).not.toHaveBeenCalled();
      } finally {
        await h.host.session.close();
      }
    },
  );

  it.each([false, true])(
    'reuses the raw name of a seeded generated output (project code=%s)',
    async (projectCode) => {
      const rawName = 'my results.csv';
      const output = file('output', {
        filename: sanitizeArtifactPath(rawName),
        conversationId: 'conversation',
        context: FileContext.execute_code,
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              file_id: 'output-remote',
              storage_session_id: 'output-store',
            },
          },
        },
      });
      expect(output.filename).not.toBe(rawName);
      const seed: CodeEnvFile[] = [
        {
          id: 'output-remote',
          resource_id: 'user',
          kind: 'user',
          storage_session_id: 'output-store',
          name: rawName,
        },
      ];
      const h = harness({
        inputs: [],
        setup: [],
        rootFiles: [output],
        rootSeed: seed,
        getCodeFileInfo: async () => null,
      });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: projectCode },
      }).projects;
      h.req.body = { conversationId: 'conversation' };
      h.req.chatProjectContext = {
        projectId: 'project',
        contextRevision: 0,
        instructions: '',
        resources: [],
        file_ids: [output.file_id],
      };
      const root = h.contexts.get('parent')!;
      const project = getProjectCodeScope(h.req, root.codeExecutionContext!.codeSessionKey);
      root.provisionState = {
        codeEnvFiles: [],
        vectorDBFiles: [],
        aliveFileIds: new Set([output.file_id]),
        agentScopedFileIds: new Set(),
        project,
      };
      const canonical = structuredClone(output);
      h.provisionToCodeEnv.mockRejectedValue(new Error('Code API unavailable'));
      try {
        await h.host.session.prepareTools('parent', undefined, h.signal, 'snapshot');
        for (let attempt = 0; attempt < 2; attempt++) {
          const delivered = await h.host.provisionPrepared(['bash_tool'], 'parent', h.signal);
          expect(delivered).toBeUndefined();
          const prior = { session_id: 'root', files: seed };
          expect((mergeCodeFilesIntoContext(prior, delivered) ?? prior).files).toEqual(seed);
        }
        if (projectCode) {
          expect(project?.sessionPlan?.mountedNames.get(output.file_id)).toBe(rawName);
          expect((await h.host.session.list('parent')).code_file_context).toContain(
            `/mnt/data/${rawName}`,
          );
        }
        expect(h.getCodeFileInfo).not.toHaveBeenCalled();
        expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
        expect(h.updateCodeEnvRef).not.toHaveBeenCalled();
        expect(output).toEqual(canonical);
      } finally {
        await h.host.session.close();
      }
    },
  );

  it('delivers both announced paths for same-named files in the root chat', async () => {
    const h = harness({
      inputs: [],
      setup: [],
      rootSeed: [
        {
          id: 'output-remote',
          resource_id: 'user',
          kind: 'user',
          storage_session_id: 'output-store',
          name: 'results.csv',
        },
      ],
    });
    h.req.config!.projects = configSchema.parse({
      version: '1.3.9',
      projects: { codeExecution: true },
    }).projects;
    h.req.chatProjectContext = {
      projectId: 'project',
      contextRevision: 0,
      instructions: '',
      resources: [],
      file_ids: ['upload', 'output'],
    };
    h.req.body = { conversationId: 'conversation' };
    const records = ['upload', 'output'].map((id, index) =>
      file(id, {
        filename: 'results.csv',
        conversationId: 'conversation',
        context: index === 0 ? FileContext.message_attachment : FileContext.execute_code,
        createdAt: new Date(index + 1),
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              file_id: `${id}-remote`,
              storage_session_id: `${id}-store`,
              sandboxFilename: 'results.csv',
            },
          },
        },
      }),
    );
    h.req.chatProjectFiles = structuredClone(records);
    const root = h.contexts.get('parent')!;
    const project = getProjectCodeScope(h.req, root.codeExecutionContext!.codeSessionKey)!;
    const scope = { ...project, projectFileIds: new Set(['upload', 'output']) };
    const initial = await selectCodeFiles({
      files: records,
      project: scope,
      routeKey: 'managed-worker',
      getFileInfo: async () => ({ lastModified: new Date().toISOString() }),
    });
    expect(initial.selected.map((entry) => entry.file.file_id)).toEqual(['output']);
    project.sessionPlan!.frozen = true;
    root.tool_resources = { execute_code: { files: records } };
    root.provisionState = {
      codeEnvFiles: [],
      vectorDBFiles: [],
      aliveFileIds: new Set(['upload', 'output']),
      agentScopedFileIds: new Set(),
      project: scope,
    };
    const listing = await h.host.session.list('parent', undefined, h.signal);
    const delivered = await h.host.provision(['bash_tool'], 'parent', h.signal);
    const aliases = new Map(delivered?.map((entry) => [entry.name, entry.id]));
    expect(project.sessionPlan!.mountedNames.get('upload')).toMatch(/^results-.+\.csv$/);
    expect(aliases.has(project.sessionPlan!.mountedNames.get('upload')!)).toBe(true);
    expect(delivered).toHaveLength(1);
    expect(delivered?.[0]?.replaces).not.toContainEqual({
      id: 'output-remote',
      storage_session_id: 'output-store',
    });
    expect(root.primedCodeFiles?.[0].name).toBe('results.csv');
    const merged = mergeCodeFilesIntoContext(
      { session_id: 'existing-root', files: root.primedCodeFiles },
      delivered,
    );
    expect(merged?.files.map((entry) => entry.name)).toEqual([
      'results.csv',
      project.sessionPlan!.mountedNames.get('upload'),
    ]);
    expect(listing.code_file_context).toContain(
      `/mnt/data/${project.sessionPlan!.mountedNames.get('upload')}`,
    );
    expect(
      h.req.chatProjectFiles?.[0]?.metadata?.codeEnvRefs?.['managed-worker']?.sandboxFilename,
    ).toBe('results.csv');
    expect(h.updateCodeEnvRef).not.toHaveBeenCalled();
    h.getCodeFileInfo.mockClear();
    const retried = await h.host.provision(['bash_tool'], 'parent', h.signal);
    expect(retried?.map((entry) => entry.name)).toEqual(delivered?.map((entry) => entry.name));
    expect(h.getCodeFileInfo.mock.calls.every(([ref]) => ref.file_id !== 'output-remote')).toBe(
      true,
    );
    await h.host.session.close();
  });

  it('replaces only the recovered record among same-named stored files', async () => {
    const records = ['upload', 'output'].map((id, index) =>
      file(id, {
        filename: 'results.csv',
        conversationId: 'conversation',
        createdAt: new Date(index + 1),
        context: index === 0 ? FileContext.message_attachment : FileContext.execute_code,
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              file_id: `${id}-remote`,
              storage_session_id: `${id}-store`,
              sandboxFilename: 'results.csv',
            },
          },
        },
      }),
    );
    const h = harness({
      inputs: [],
      setup: [],
      rootFiles: records,
      getCodeFileInfo: async (ref) => ({
        lastModified: new Date(
          ref.file_id === 'output-remote' ? Date.now() - 24 * 3_600_000 : Date.now(),
        ).toISOString(),
      }),
    });
    h.contexts.get('parent')!.provisionState = {
      codeEnvFiles: [],
      vectorDBFiles: [],
      aliveFileIds: new Set(['upload', 'output']),
      agentScopedFileIds: new Set(),
    };
    try {
      const delivered = await h.host.provision(['bash_tool'], 'parent', h.signal);
      expect(delivered).toEqual([
        expect.objectContaining({
          id: 'remote-output',
          name: 'results.csv',
          replaces: [{ id: 'output-remote', storage_session_id: 'output-store' }],
        }),
      ]);
      expect(h.provisionToCodeEnv.mock.calls.map(([params]) => params.file.file_id)).toEqual([
        'output',
      ]);
    } finally {
      await h.host.session.close();
    }
  });

  it('mounts every announced path when a child receives a same-named publication and upload', async () => {
    const input = file('input', {
      filename: 'results.csv',
      metadata: {
        codeEnvRefs: {
          'managed-worker': {
            kind: 'user',
            id: 'user',
            file_id: 'input-remote',
            storage_session_id: 'input-store',
            sandboxFilename: 'results.csv',
          },
        },
      },
    });
    const h = harness({ inputs: [input], setup: [] });
    h.req.config!.projects = configSchema.parse({
      version: '1.3.9',
      projects: { codeExecution: true },
    }).projects;
    h.req.config!.endpoints!.agents!.fileSharing!.allowSiblingSharing = true;
    h.req.chatProjectContext = {
      projectId: 'project',
      contextRevision: 0,
      instructions: '',
      resources: [],
      file_ids: ['project-file'],
    };
    h.req.body = { conversationId: 'conversation' };
    const canonical = file('project-file', {
      filename: 'other.csv',
      conversationId: 'other',
      metadata: {
        codeEnvRefs: {
          'managed-worker': {
            kind: 'user',
            id: 'user',
            file_id: 'project-remote',
            storage_session_id: 'project-store',
            sandboxFilename: 'other.csv',
          },
        },
      },
    });
    h.req.chatProjectFiles = [canonical];
    const source = h.contexts.get('worker')!;
    const project = getProjectCodeScope(h.req, source.codeExecutionContext!.codeSessionKey)!;
    project.sessionPlan!.destinations.set(canonical.file_id, 'other.csv');
    project.sessionPlan!.frozen = true;
    source.tool_resources = { execute_code: { files: [] } };
    source.provisionState = {
      codeEnvFiles: [canonical],
      vectorDBFiles: [],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(),
      codeEnvDestinations: new Map([[canonical.file_id, 'other.csv']]),
      project: { ...project, projectFileIds: new Set([canonical.file_id]) },
    };
    const producer = identity('producer');
    const reader = identity('reader');
    await h.prepare(producer);
    await h.host.session.capture('worker', producer, 'produce', {
      session_id: 'private-producer',
      files: [{ id: 'results', name: 'results.csv' }],
    });
    const artifact = (await h.host.session.list('worker', producer)).artifacts[0];
    const published = await h.host.session.publish(
      'worker',
      producer,
      artifact.artifact_id,
      ['worker'],
      h.signal,
    );
    const prepared = await h.prepare(reader);
    const listing = await h.host.session.list('worker', reader, h.signal);
    const delivered = await h.host.provision(['bash_tool'], 'worker', h.signal, reader);
    const names = new Set(delivered?.map((entry) => `/mnt/data/${entry.name}`));
    expect(listing.files.map((entry) => entry.file_id)).toEqual(
      expect.arrayContaining(['input', published.file_id]),
    );
    for (const entry of listing.files) {
      expect(entry.code_path).toBeDefined();
      expect(names.has(entry.code_path!)).toBe(true);
      expect(String(prepared.messages?.[0].content)).toContain(entry.code_path!);
    }
    expect(names.size).toBe(3);
    await h.host.session.close();
  });

  it('keeps authorized project inputs and their advertised paths in isolated child sessions', async () => {
    const h = harness({ inputs: [], setup: [file('worker-setup', { filename: 'results.csv' })] });
    h.req.config!.projects = configSchema.parse({
      version: '1.3.9',
      projects: { codeExecution: true },
    }).projects;
    h.req.chatProjectContext = {
      projectId: 'project',
      contextRevision: 0,
      instructions: '',
      resources: [],
      file_ids: ['project-file', 'unadmitted-project'],
    };
    h.req.body = { conversationId: 'conversation' };
    const ref = {
      kind: 'user' as const,
      id: 'user',
      file_id: 'project-remote',
      storage_session_id: 'project-store',
      sandboxFilename: 'results.csv',
    };
    const canonical = file('project-file', {
      filename: 'results.csv',
      conversationId: 'other',
      metadata: { codeEnvRefs: { 'managed-worker': ref } },
    });
    h.req.chatProjectFiles = [canonical, file('unadmitted-project')];
    const source = h.contexts.get('worker')!;
    const project = getProjectCodeScope(h.req, source.codeExecutionContext!.codeSessionKey)!;
    project.sessionPlan!.destinations.set(canonical.file_id, 'results-project.csv');
    project.sessionPlan!.mountedNames.set('worker-setup', 'results.csv');
    project.sessionPlan!.mountedNames.set('historical', 'private.csv');
    project.sessionPlan!.frozen = true;
    source.tool_resources = {
      execute_code: {
        files: [
          file('historical'),
          {
            ...canonical,
            metadata: {
              codeEnvRefs: {
                'managed-worker': {
                  ...ref,
                  file_id: 'temporary',
                  sandboxFilename: 'parent-alias.csv',
                },
              },
            },
          },
        ],
      },
    };
    source.provisionState = {
      codeEnvFiles: [],
      vectorDBFiles: [],
      aliveFileIds: new Set([canonical.file_id]),
      agentScopedFileIds: new Set(['worker-setup']),
      codeEnvDestinations: new Map([
        [canonical.file_id, 'results-project.csv'],
        ['worker-setup', 'results.csv'],
      ]),
      project: { ...project, projectFileIds: new Set([canonical.file_id]) },
    };
    const executions = [identity('first'), identity('second')];
    try {
      await Promise.all(executions.map((execution) => h.prepare(execution)));
      for (const execution of executions) {
        const context = h.host.getContext('worker', execution)!;
        expect(context.provisionState?.codeEnvFiles.map((file) => file.file_id).sort()).toEqual([
          'project-file',
          'worker-setup',
        ]);
        expect(context.provisionState?.project?.projectFileIds).toEqual(new Set(['project-file']));
        const plan = context.provisionState?.project?.sessionPlan;
        expect(plan?.destinations.get(canonical.file_id)).toBe('results-project.csv');
        expect(plan?.mountedNames.has('historical')).toBe(false);
        expect(plan).not.toBe(project.sessionPlan);
        expect(h.req.projectCodeSessions?.get(context.codeSessionKey!)).toBe(plan);
        const mounted = await h.host.provision(
          [Constants.EXECUTE_CODE, EToolResources.file_search],
          'worker',
          h.signal,
          execution,
        );
        expect(mounted?.map((file) => file.name).sort()).toEqual(
          ['results-project.csv', 'results.csv'].sort(),
        );
      }
      expect(
        h.host.getContext('worker', executions[0])?.provisionState?.project?.sessionPlan,
      ).not.toBe(h.host.getContext('worker', executions[1])?.provisionState?.project?.sessionPlan);
      expect(
        h.provisionToCodeEnv.mock.calls.filter(
          ([input]) => input.file.file_id === canonical.file_id,
        ),
      ).toHaveLength(1);
      expect(
        h.provisionToCodeEnv.mock.calls
          .filter(([input]) => input.file.file_id === canonical.file_id)
          .every(([input]) => input.entity_id == null),
      ).toBe(true);
      expect(h.updateCodeEnvRef.mock.calls).toHaveLength(2);
      expect(h.provisionToVectorDB.mock.calls.map(([input]) => input.file.file_id)).toEqual([
        'worker-setup',
        'worker-setup',
      ]);
      expect(h.req.chatProjectFiles[0].metadata?.codeEnvRefs?.['managed-worker']).toEqual(ref);
      expect(source.provisionState.project?.sessionPlan).toBe(project.sessionPlan);
    } finally {
      await h.host.session.close();
    }
  });

  it.each([
    { named: true, temporary: false },
    { named: false, temporary: false },
    { named: true, temporary: true },
    { named: false, temporary: true },
  ])(
    'delivers live setup files alongside project uploads and recovers expiry (named=$named, temporary=$temporary)',
    async ({ named, temporary }) => {
      const setupRef: CodeEnvRef = {
        kind: 'agent',
        id: 'worker',
        storage_session_id: 'setup-storage',
        file_id: 'original-setup',
        ...(named ? { sandboxFilename: 'results.csv' } : {}),
      };
      const setup = file('worker-setup', {
        filename: 'results.csv',
        context: FileContext.agents,
        metadata: { codeEnvRefs: { 'managed-worker': setupRef } },
      });
      let expired = false;
      const h = harness({
        inputs: [],
        setup: [setup],
        getCodeFileInfo: async (ref) => ({
          lastModified:
            expired && ['original-setup', 'initial-setup-alias'].includes(ref.file_id)
              ? new Date(Date.now() - 24 * 3_600_000).toISOString()
              : new Date().toISOString(),
          originalFilename: ref.sandboxFilename ?? 'results.csv',
        }),
      });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: true },
      }).projects;
      h.req.body = { conversationId: 'conversation' };
      h.req.chatProjectContext = {
        projectId: 'project',
        contextRevision: 0,
        instructions: '',
        resources: [],
        file_ids: ['project-file'],
      };
      const canonical = file('project-file', {
        filename: 'results.csv',
        conversationId: 'other',
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              storage_session_id: 'project-storage',
              file_id: 'original-project',
              sandboxFilename: 'results.csv',
            },
          },
        },
      });
      h.req.chatProjectFiles = [canonical];
      const source = h.contexts.get('worker')!;
      const project = getProjectCodeScope(h.req, source.codeExecutionContext!.codeSessionKey)!;
      const setupName = temporary ? 'results-private.csv' : 'results.csv';
      project.sessionPlan!.destinations.set(canonical.file_id, 'results-project.csv');
      project.sessionPlan!.mountedNames.set(setup.file_id, setupName);
      project.sessionPlan!.frozen = true;
      source.tool_resources = { execute_code: { files: [setup, canonical] } };
      source.provisionState = {
        codeEnvFiles: [],
        vectorDBFiles: [],
        aliveFileIds: new Set([setup.file_id, canonical.file_id]),
        agentScopedFileIds: new Set([setup.file_id]),
        project,
      };
      if (temporary) {
        await saveCodeFileReference({
          req: h.req,
          routeKey: 'managed-worker',
          file: setup,
          ref: { ...setupRef, file_id: 'initial-setup-alias', sandboxFilename: setupName },
          temporary: true,
          save: async () => {
            throw new Error('A temporary setup mount must not overwrite its canonical reference');
          },
        });
      }
      try {
        await h.prepare();
        const context = h.host.getContext('worker', identity())!;
        expect(context.provisionState?.codeEnvFiles.map((file) => file.file_id)).toEqual([
          canonical.file_id,
        ]);
        const first = await h.host.provisionPrepared(
          [Constants.BASH_TOOL],
          'worker',
          h.signal,
          identity(),
        );
        expect(first).toHaveLength(2);
        expect(first).toContainEqual(
          expect.objectContaining({
            id: temporary ? 'initial-setup-alias' : setupRef.file_id,
            name: setupName,
            kind: 'agent',
            resource_id: 'worker',
          }),
        );
        expect(first?.map((file) => file.name).sort()).toEqual(
          [setupName, 'results-project.csv'].sort(),
        );
        expect(h.provisionToCodeEnv.mock.calls.map(([params]) => params.file.file_id)).toEqual([
          canonical.file_id,
        ]);

        expired = true;
        const recovered = await h.host.provision(
          [Constants.BASH_TOOL],
          'worker',
          h.signal,
          identity(),
        );
        expect(recovered).toHaveLength(2);
        expect(recovered).toContainEqual(
          expect.objectContaining({
            id: 'remote-worker-setup',
            name: setupName,
            replaces: expect.arrayContaining([
              {
                id: temporary ? 'initial-setup-alias' : setupRef.file_id,
                storage_session_id: setupRef.storage_session_id,
              },
            ]),
          }),
        );
        const refreshed = mergeCodeFilesIntoContext(
          { session_id: 'existing-child', files: first },
          recovered,
        );
        expect(refreshed?.session_id).toBe('existing-child');
        expect(refreshed?.files.find((entry) => entry.name === setupName)?.id).toBe(
          'remote-worker-setup',
        );
        expect(
          h.provisionToCodeEnv.mock.calls.filter(
            ([params]) => params.file.file_id === setup.file_id,
          ),
        ).toEqual([[expect.objectContaining({ entity_id: 'worker', sandboxFilename: setupName })]]);
        expect(
          h.updateCodeEnvRef.mock.calls.filter(([update]) => update.file_id === setup.file_id),
        ).toHaveLength(temporary ? 0 : 1);
        expect(setup.metadata?.codeEnvRefs?.['managed-worker']).toEqual(setupRef);
        expect(canonical.metadata?.codeEnvRefs?.['managed-worker']?.file_id).toBe(
          'original-project',
        );
      } finally {
        await h.host.session.close();
      }
    },
  );

  it('seeds a live setup file in a new child even when nothing needs uploading', async () => {
    const ref: CodeEnvRef = {
      kind: 'agent',
      id: 'worker',
      storage_session_id: 'private-storage',
      file_id: 'private-input',
      sandboxFilename: 'setup.csv',
    };
    const h = harness({
      inputs: [],
      setup: [
        file('worker-setup', {
          context: FileContext.agents,
          filename: 'setup.csv',
          metadata: { codeEnvRefs: { 'managed-worker': ref } },
        }),
      ],
    });
    try {
      await h.prepare();
      const mounted = await h.host.provisionPrepared(
        [Constants.BASH_TOOL],
        'worker',
        h.signal,
        identity(),
      );
      expect(mounted).toEqual([
        {
          id: ref.file_id,
          resource_id: 'worker',
          storage_session_id: ref.storage_session_id,
          name: 'setup.csv',
          kind: 'agent',
        },
      ]);
      expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
      expect(h.updateCodeEnvRef).not.toHaveBeenCalled();
    } finally {
      await h.host.session.close();
    }
  });

  it.each([false, true])(
    'drops optional project inputs after the required child files spend the budget (setup: %s)',
    async (withSetup) => {
      const h = harness({
        inputs: [file('input', { bytes: 600_000 })],
        setup: withSetup ? [file('worker-setup', { bytes: 200_000 })] : [],
      });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: true },
      }).projects;
      h.req.config!.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
      h.req.chatProjectContext = {
        projectId: 'project',
        contextRevision: 0,
        instructions: '',
        resources: [],
        file_ids: ['project-file'],
      };
      h.req.body = { conversationId: 'conversation' };
      const source = h.contexts.get('worker')!;
      source.provisionState = {
        codeEnvFiles: [file('project-file', { bytes: 600_000 })],
        vectorDBFiles: [],
        aliveFileIds: new Set(),
        agentScopedFileIds: new Set(),
        project: { projectFileIds: new Set(['project-file']), conversationId: 'conversation' },
      };
      try {
        await h.prepare();
        const context = h.host.getContext('worker', identity())!;
        expect(context.provisionState?.codeEnvFiles.map((file) => file.file_id).sort()).toEqual(
          withSetup ? ['input', 'worker-setup'] : ['input'],
        );
        const mounted = await h.host.provision(
          [Constants.EXECUTE_CODE],
          'worker',
          h.signal,
          identity(),
        );
        expect(mounted).toHaveLength(withSetup ? 2 : 1);
        expect(
          h.provisionToCodeEnv.mock.calls.some(([input]) => input.file.file_id === 'project-file'),
        ).toBe(false);
        if (withSetup) expect(h.loadFiles).toHaveBeenCalledTimes(1);
      } finally {
        await h.host.session.close();
      }
    },
  );

  it('reserves the real storage name of a generated run file before project imports', async () => {
    const generated = file('generated', {
      filename: 'my_results-081045.csv',
      conversationId: 'conversation',
      metadata: {
        codeEnvRefs: {
          'managed-worker': {
            kind: 'user',
            id: 'user',
            storage_session_id: 'original-store',
            file_id: 'original-output',
          },
        },
      },
    });
    const h = harness({
      inputs: [generated],
      setup: [],
      getCodeFileInfo: async (ref) => ({
        lastModified: new Date().toISOString(),
        originalFilename:
          ref.file_id === 'original-output' ? 'my results.csv' : ref.sandboxFilename,
      }),
    });
    h.req.config!.projects = configSchema.parse({
      version: '1.3.9',
      projects: { codeExecution: true },
    }).projects;
    h.req.chatProjectContext = {
      projectId: 'project',
      contextRevision: 0,
      instructions: '',
      resources: [],
      file_ids: ['project-file'],
    };
    h.req.body = { conversationId: 'conversation' };
    const source = h.contexts.get('worker')!;
    const project = getProjectCodeScope(h.req, source.codeExecutionContext!.codeSessionKey)!;
    const imported = file('project-file', { filename: 'my results.csv', conversationId: 'other' });
    source.tool_resources = {};
    source.provisionState = {
      codeEnvFiles: [imported],
      vectorDBFiles: [],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(),
      project: { ...project, projectFileIds: new Set([imported.file_id]) },
    };
    try {
      const result = await h.prepare();
      const context = h.host.getContext('worker', identity())!;
      expect(
        context.provisionState?.project?.sessionPlan?.mountedNames.get(generated.file_id),
      ).toBe('my results.csv');
      expect(result.messages?.[0].content).toContain('"code_path":"/mnt/data/my results.csv"');
      expect(h.getCodeFileInfo).toHaveBeenCalledTimes(1);
    } finally {
      await h.host.session.close();
    }
  });

  it.each([
    ['child', false, 'results.csv'],
    ['child', true, 'results.csv'],
    ['child', false, 'my results.csv'],
    ['child', true, 'my results.csv'],
    ['root', false, 'results.csv'],
    ['root', true, 'results.csv'],
    ['root', false, 'my results.csv'],
    ['root', true, 'my results.csv'],
    ['budget', true, 'results.csv'],
    ['budget', true, 'my results.csv'],
  ])(
    'announces a published file path before code execution (receiver: %s, already prepared: %s, name: %s)',
    async (receiver, existingChild, rawName) => {
      const overBudget = receiver === 'budget';
      const isRoot = receiver === 'root';
      const h = harness({ inputs: [], setup: [], publicationBytes: overBudget ? 600_000 : 12 });
      h.req.config!.projects = configSchema.parse({
        version: '1.3.9',
        projects: { codeExecution: true },
      }).projects;
      h.req.config!.endpoints!.agents!.fileSharing!.allowSiblingSharing = !isRoot;
      if (overBudget) {
        h.req.config!.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
      }
      h.req.chatProjectContext = {
        projectId: 'project',
        contextRevision: 0,
        instructions: '',
        resources: [],
        file_ids: ['project-file'],
      };
      h.req.body = { conversationId: 'conversation' };
      const canonical = file('project-file', {
        filename: rawName,
        bytes: overBudget ? 600_000 : 12,
        conversationId: 'other',
        metadata: {
          codeEnvRefs: {
            'managed-worker': {
              kind: 'user',
              id: 'user',
              file_id: 'project-remote',
              storage_session_id: 'project-store',
              sandboxFilename: rawName,
            },
          },
        },
      });
      h.req.chatProjectFiles = [canonical];
      const source = h.contexts.get('worker')!;
      const project = getProjectCodeScope(
        h.req,
        source.codeSessionKey ?? source.codeExecutionContext!.codeSessionKey,
      )!;
      project.sessionPlan!.destinations.set(canonical.file_id, rawName);
      project.sessionPlan!.frozen = true;
      source.tool_resources = { execute_code: { files: [] } };
      source.provisionState = {
        codeEnvFiles: [canonical],
        vectorDBFiles: [],
        aliveFileIds: new Set(),
        agentScopedFileIds: new Set(),
        codeEnvDestinations: new Map([[canonical.file_id, rawName]]),
        project: { ...project, projectFileIds: new Set([canonical.file_id]) },
      };
      if (isRoot) {
        const root = h.contexts.get('parent')!;
        root.tool_resources = { execute_code: { files: [canonical] } };
        root.provisionState = {
          ...source.provisionState,
          codeEnvFiles: [],
          aliveFileIds: new Set([canonical.file_id]),
        };
      }
      const producer = identity('producer');
      const reader = isRoot ? undefined : identity('reader');
      const receivingAgentId = isRoot ? 'parent' : 'worker';
      try {
        await h.prepare(producer);
        if (existingChild) {
          if (!isRoot) await h.prepare(reader);
          await h.host.provision([Constants.EXECUTE_CODE], receivingAgentId, h.signal, reader);
        }
        await h.host.session.capture('worker', producer, 'produce-results', {
          session_id: 'private-producer',
          files: [{ id: 'results', name: rawName }],
        });
        const artifact = (await h.host.session.list('worker', producer)).artifacts[0];
        const published = await h.host.session.publish(
          'worker',
          producer,
          artifact.artifact_id,
          isRoot ? [] : ['worker'],
          h.signal,
        );
        let initialMessage: string | undefined;
        if (!existingChild && !isRoot) {
          const result = await h.prepare(reader);
          initialMessage = String(result.messages?.[0].content);
        }
        const listing = await h.host.session.list(receivingAgentId, reader, h.signal);
        const entry = listing.files.find((file) => file.file_id === published.file_id)!;
        expect(entry.filename).toBe(sanitizeArtifactPath(rawName));
        expect(entry.code_path).toBeDefined();
        const delivered = await h.host.provision(
          [Constants.EXECUTE_CODE],
          receivingAgentId,
          h.signal,
          reader,
        );
        const context = h.host.getContext(receivingAgentId, reader)!;
        const publicationPath = context.provisionState!.project!.sessionPlan!.mountedNames.get(
          published.file_id,
        )!;
        const projectPath = context.provisionState!.project!.sessionPlan!.destinations.get(
          canonical.file_id,
        )!;
        const mounted = await selectCodeFiles({
          // primeFiles reads canonical database records, not this actor's temporary copies.
          files: (context.tool_resources?.execute_code?.files ?? []).map((file) =>
            file.file_id === published.file_id ? published : file,
          ),
          privateFileIds: context.provisionState!.agentScopedFileIds,
          project: context.provisionState!.project,
          getTurnRef: (file, destination) =>
            getTurnCodeEnvRef(h.req, 'managed-worker', file, destination),
          routeKey: 'managed-worker',
          getFileInfo: (ref) =>
            h.getCodeFileInfo(ref, context.codeExecutionContext ?? {}, h.signal),
        });
        expect(entry.code_path).toBe(`/mnt/data/${publicationPath}`);
        expect(publicationPath).not.toBe(projectPath);
        expect(mounted.selected).toContainEqual(
          expect.objectContaining({
            file: expect.objectContaining({ file_id: published.file_id }),
            sandboxName: publicationPath,
            sourceRef: expect.objectContaining({
              file_id: delivered?.find((file) => file.name === publicationPath)?.id,
            }),
            temporary: existingChild || isRoot,
          }),
        );
        if (overBudget) {
          expect(context.provisionState?.project?.projectFileIds).toEqual(new Set());
          expect(listing.code_file_context).toBeUndefined();
          expect(mounted.selected).toHaveLength(1);
        } else {
          expect(listing.code_file_context).toContain(`/mnt/data/${projectPath}`);
          if (!isRoot) {
            expect(context.dynamicToolContextMap?.queued_code_files).toContain(
              `/mnt/data/${projectPath}`,
            );
          }
        }
        if (existingChild || isRoot) {
          expect(projectPath).toBe(rawName);
        } else {
          expect(publicationPath).toBe(rawName);
          expect(initialMessage).toContain(`"code_path":"/mnt/data/${publicationPath}"`);
          expect(initialMessage).toContain(`/mnt/data/${projectPath}`);
          expect(initialMessage).toContain('replace any earlier file-path notes');
        }
        expect(canonical.metadata?.codeEnvRefs?.['managed-worker']?.sandboxFilename).toBe(rawName);
        expect(published.metadata?.codeEnvRefs?.['managed-worker']).toEqual({
          kind: 'user',
          id: 'user',
          storage_session_id: 'private-producer',
          file_id: 'results',
        });
      } finally {
        await h.host.session.close();
      }
    },
  );

  it.each([
    ['file_search', { file_search: { citations: ['document'] } }],
    ['web_search', { web_search: { results: ['page'] } }],
    ['set_memory', { memory: { key: 'preference', value: 'saved' } }],
    ['interactive_tool', { ui_resources: { data: ['widget'] } }],
    [
      'generate_image',
      { content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aQ==' } }] },
    ],
  ])('preserves ordinary %s artifact delivery from a shared-file child', async (name, artifact) => {
    const h = harness();
    await h.prepare();
    const callback = jest.fn(async () => undefined);
    const data = { output: { name, tool_call_id: 'other-output', content: '', artifact } };
    const metadata = { executingAgentId: 'worker', executionContext: identity() };

    await h.host.deliverToolEnd(callback, data, metadata);

    expect(callback).toHaveBeenCalledWith(data, metadata);
    expect(h.deps.snapshots.capture).not.toHaveBeenCalled();
    expect((await h.host.session.list('worker', identity())).artifacts).toEqual([]);
  });

  it.each(['execute_code', 'bash_tool', 'create_file'])(
    'keeps %s outputs private until publication',
    async (name) => {
      const h = harness();
      await h.prepare();
      const callback = jest.fn(async () => undefined);
      await h.host.deliverToolEnd(
        callback,
        {
          output: {
            name,
            tool_call_id: 'private-output',
            content: '',
            artifact: {
              session_id: 'sandbox',
              files: [{ id: 'chart', name: 'chart.png' }],
            },
          },
        },
        { executingAgentId: 'worker', executionContext: identity() },
      );

      expect(callback).not.toHaveBeenCalled();
      expect(h.emit).not.toHaveBeenCalled();
      expect((await h.host.session.list('worker', identity())).artifacts).toEqual([
        { artifact_id: expect.any(String), filename: 'chart.png' },
      ]);
      const [artifact] = (await h.host.session.list('worker', identity())).artifacts;
      await h.host.session.publish('worker', identity(), artifact.artifact_id, [], h.signal);
      expect(h.emit).toHaveBeenCalledTimes(1);
    },
  );

  it('does not publish a private sandbox image merely because the child reads it', async () => {
    const h = harness();
    await h.prepare();
    const callback = jest.fn(async () => undefined);
    const artifact = {
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aQ==' } }],
    };
    const data = {
      output: { name: 'read_file', tool_call_id: 'inspect-image', content: 'Image', artifact },
    };

    await h.host.deliverToolEnd(callback, data, {
      executingAgentId: 'worker',
      executionContext: identity(),
    });

    expect(callback).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
    expect(h.deps.snapshots.capture).not.toHaveBeenCalled();
    expect(data.output.artifact).toBe(artifact);
  });

  it('reuses the handler authorized batch without a second publication query', async () => {
    const h = harness();
    await expect(
      h.host.provisionPrepared([Constants.EXECUTE_CODE], 'parent', h.signal),
    ).rejects.toThrow('not been prepared');
    await h.prepare();
    await h.host.session.prepareTools('worker', identity(), h.signal);
    const reads = h.listPublications.mock.calls.length;
    await h.host.provisionPrepared([Constants.EXECUTE_CODE], 'worker', h.signal, identity());
    expect(h.listPublications).toHaveBeenCalledTimes(reads);
    expect(h.provisionToCodeEnv).toHaveBeenCalledTimes(2);
  });

  it('keeps current inputs user-scoped and each agent setup agent-scoped without historical files', async () => {
    const current = file('current', { context: FileContext.agents });
    const h = harness({ inputs: [current] });
    h.loadFiles.mockResolvedValue([...h.setup, file('unrequested-setup', { user: 'other' })]);
    await h.prepare();
    await h.host.provision([Constants.EXECUTE_CODE, 'file_search'], 'worker', h.signal, identity());
    expect(h.loadFiles).toHaveBeenCalledWith(['worker-setup']);
    expect(h.filterFiles).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'worker', userId: 'user' }),
    );
    const codeCalls = h.provisionToCodeEnv.mock.calls.map(([params]) => [
      params.file.file_id,
      params.entity_id,
    ]);
    expect(codeCalls).toEqual(
      expect.arrayContaining([
        ['current', undefined],
        ['worker-setup', 'worker'],
      ]),
    );
    expect(codeCalls).toHaveLength(2);
    expect(
      h.provisionToVectorDB.mock.calls.map(([params]) => [params.file.file_id, params.entity_id]),
    ).toEqual(
      expect.arrayContaining([
        ['current', undefined],
        ['worker-setup', 'worker'],
      ]),
    );
    const context = h.host.getContext('worker', identity());
    expect(
      context?.tool_resources?.execute_code?.files?.map((entry) => entry.file_id).sort(),
    ).toEqual(['current', 'worker-setup']);
    expect(context?.tool_resources?.file_search?.file_ids).toEqual(['worker-setup']);
    expect(context?.provisionState?.agentScopedFileIds).toEqual(new Set(['worker-setup']));
    expect(current.metadata?.codeEnvRefs).toBeUndefined();
    expect(
      h.contexts.get('worker')?.tool_resources?.execute_code?.files?.map((entry) => entry.file_id),
    ).toEqual(['historical']);
  });

  it('confirms an unrecorded setup embedding instead of embedding it again', async () => {
    /* A worker's File Search setup file embedded before namespaces were tracked already has
     * vectors in the worker's namespace; a shared-file run must not store a second copy. */
    const hasEntityEmbeddings = jest.fn().mockResolvedValue(true);
    const adoptLegacySearchEmbeddings = jest.fn().mockResolvedValue(['worker-setup']);
    const h = harness({
      setup: [file('worker-setup', { context: FileContext.agents, embedded: true })],
      hasEntityEmbeddings,
      adoptLegacySearchEmbeddings,
    });
    await h.prepare();
    await h.host.provision(['file_search'], 'worker', h.signal, identity());

    expect(hasEntityEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ file_id: 'worker-setup', entity_id: 'worker' }),
    );
    expect(h.provisionToVectorDB.mock.calls.map(([params]) => params.file.file_id)).not.toContain(
      'worker-setup',
    );
  });

  it('retains only admitted advertised paths when preparing isolated child queues', async () => {
    const current = file('input', { filename: 'data.csv' });
    const h = harness({ inputs: [current] });
    const source = h.contexts.get('worker')!;
    source.provisionState = {
      codeEnvFiles: [current],
      vectorDBFiles: [],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(['worker-setup']),
      codeEnvDestinations: new Map([
        ['input', 'data-shared.csv'],
        ['worker-setup', 'setup-advertised.csv'],
        ['historical', 'private-history.csv'],
      ]),
    };
    const executions = [identity('first'), identity('second')];
    await Promise.all(executions.map((execution) => h.prepare(execution)));
    for (const execution of executions) {
      const destinations = h.host.getContext('worker', execution)?.provisionState
        ?.codeEnvDestinations;
      expect(destinations).toEqual(
        new Map([
          ['input', 'data-shared.csv'],
          ['worker-setup', 'setup-advertised.csv'],
        ]),
      );
      expect(destinations).not.toBe(source.provisionState.codeEnvDestinations);
      await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, execution);
    }
    expect(h.provisionToCodeEnv).toHaveBeenCalledTimes(4);
    for (const [params] of h.provisionToCodeEnv.mock.calls) {
      expect(params.sandboxFilename).toBe(
        source.provisionState.codeEnvDestinations?.get(params.file.file_id),
      );
    }
    expect(source.provisionState.codeEnvDestinations?.has('historical')).toBe(true);
    expect(
      h.host.getContext('worker', executions[0])?.provisionState?.codeEnvDestinations,
    ).not.toBe(h.host.getContext('worker', executions[1])?.provisionState?.codeEnvDestinations);
  });

  it('isolates concurrent executions of the same agent without broadening storage grants', async () => {
    const h = harness();
    const first = identity('first');
    const second = identity('second');
    const results = await Promise.all([h.prepare(first), h.prepare(second)]);
    const a = h.host.getContext('worker', first)!;
    const b = h.host.getContext('worker', second)!;
    expect(a).not.toBe(b);
    expect(a.provisionState?.codeEnvFiles[0]).not.toBe(b.provisionState?.codeEnvFiles[0]);
    expect(a.codeExecutionContext?.codeSessionKey).not.toBe(b.codeExecutionContext?.codeSessionKey);
    expect(a.codeExecutionContext?.runtimeSessionHint).toBe(a.codeExecutionContext?.codeSessionKey);
    expect(b.codeExecutionContext?.runtimeSessionHint).toBe(b.codeExecutionContext?.codeSessionKey);
    expect(results[0].agentSessions?.worker.codeSessionKey).toBe(
      a.codeExecutionContext?.codeSessionKey,
    );
    expect(results[1].agentSessions?.worker.codeSessionKey).toBe(
      b.codeExecutionContext?.codeSessionKey,
    );
    await Promise.all(
      [first, second].map((context) =>
        h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, context),
      ),
    );
    expect(h.provisionToCodeEnv.mock.calls.map(([params]) => params.entity_id)).toEqual(
      expect.arrayContaining([undefined, 'worker']),
    );
    expect(
      h.provisionToCodeEnv.mock.calls.every(
        ([params]) => params.entity_id == null || params.entity_id === 'worker',
      ),
    ).toBe(true);
    expect(h.contexts.get('worker')?.codeExecutionContext?.codeSessionKey).toBe(
      'base-agent-session',
    );
  });

  it('refreshes after publication while retaining successful resources, context and setup hydration', async () => {
    const h = harness();
    await h.prepare();
    await h.host.provision([Constants.EXECUTE_CODE, 'file_search'], 'worker', h.signal, identity());
    const before = h.host.getContext('worker', identity());
    const published = await h.publishOutput();
    await h.host.provision([Constants.EXECUTE_CODE, 'file_search'], 'worker', h.signal, identity());
    expect(h.host.getContext('worker', identity())).toBe(before);
    expect(
      before?.tool_resources?.execute_code?.files?.map((entry) => entry.file_id).sort(),
    ).toEqual(['input', published.file_id, 'worker-setup'].sort());
    expect(h.provisionToCodeEnv).toHaveBeenCalledTimes(2);
    expect(h.provisionToVectorDB).toHaveBeenCalledTimes(3);
    expect(h.loadFiles).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: expect.objectContaining({ sessionId: 'private-child' }),
        provenance: expect.objectContaining({
          agentId: 'worker',
          executionId: 'child',
          parentExecutionId: 'run',
        }),
      }),
    );
  });

  it('does not provision private staged outputs before explicit publication', async () => {
    const h = harness({ setup: [] });
    await h.prepare();
    await h.host.session.capture('worker', identity(), 'private-call', {
      session_id: 'private-child',
      files: [{ id: 'private-file', name: 'private.csv' }],
    });
    await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, identity());
    expect(h.provisionToCodeEnv.mock.calls.map(([params]) => params.file.file_id)).toEqual([
      'input',
    ]);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  });

  it('preserves the root historical resources and runtime while descendants receive current inputs', async () => {
    const h = harness();
    const root = h.contexts.get('parent')!;
    root.tool_resources!.file_search = { file_ids: ['parent-setup'] };
    root.provisionState = {
      codeEnvFiles: [file('historical-deferred')],
      vectorDBFiles: [],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(['parent-setup']),
    };
    const originalCodeContext = root.codeExecutionContext;
    await h.prepare();
    await h.host.provision([Constants.EXECUTE_CODE], 'parent', h.signal);
    const published = await h.publishOutput();
    await h.host.provision([Constants.EXECUTE_CODE], 'parent', h.signal);
    expect(h.host.getContext('parent')).toBe(root);
    expect(root.codeExecutionContext).toBe(originalCodeContext);
    expect(root.codeExecutionContext?.codeSessionKey).toBe('base-agent-session');
    expect(root.tool_resources?.file_search?.file_ids).toEqual(['parent-setup']);
    expect(root.tool_resources?.execute_code?.files?.map((entry) => entry.file_id).sort()).toEqual(
      ['historical', 'historical-deferred', 'input', published.file_id].sort(),
    );
    expect(
      h.host
        .getContext('worker', identity())
        ?.provisionState?.codeEnvFiles.map((entry) => entry.file_id)
        .sort(),
    ).toEqual(['input', 'worker-setup']);
    expect(
      h.provisionToCodeEnv.mock.calls.filter(
        ([params]) => params.file.file_id === 'historical-deferred',
      ),
    ).toHaveLength(1);
    expect(h.loadFiles).toHaveBeenCalledTimes(1);
  });

  it('keeps successful refs across a partial failure, publication refresh and retry', async () => {
    const h = harness({ inputs: [file('good'), file('retry')], setup: [] });
    let fail = true;
    h.provisionToCodeEnv.mockImplementation(async (params) => {
      if (params.file.file_id === 'retry' && fail) throw new Error('Temporary Code API outage');
      return h.codeResult(params);
    });
    await h.prepare();
    await expect(
      h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, identity()),
    ).rejects.toThrow('Failed to provision');
    const before = h.host.getContext('worker', identity());
    expect(before?.pendingProvisionedCodeFiles?.map((entry) => entry.id)).toEqual(['remote-good']);
    const published = await h.publishOutput();
    fail = false;
    const recovered = await h.host.provision(
      [Constants.EXECUTE_CODE],
      'worker',
      h.signal,
      identity(),
    );
    expect(h.host.getContext('worker', identity())).toBe(before);
    expect(recovered?.map((entry) => entry.id).sort()).toEqual(
      ['remote-good', 'remote-retry', 'output'].sort(),
    );
    expect(before?.tool_resources?.execute_code?.files).toContainEqual(
      expect.objectContaining({ file_id: published.file_id }),
    );
    expect(
      h.provisionToCodeEnv.mock.calls.filter(([params]) => params.file.file_id === 'good'),
    ).toHaveLength(1);
    expect(before?.provisionState?.codeEnvFiles).toEqual([]);
  });

  it('rejects an older snapshot arriving after a newer grant removal', async () => {
    const h = harness({ setup: [] });
    await h.prepare();
    const published = await h.publishOutput();
    const context = h.host.getContext('worker', identity());
    const actor = h.host.session.actorFor('worker', identity());
    const sessionKey = context!.codeExecutionContext!.codeSessionKey;
    await h.deps.prepareAgent({
      actor,
      files: [...h.input, published],
      sessionKey,
      revision: 5,
      signal: h.signal,
    });
    await h.deps.prepareAgent({ actor, files: h.input, sessionKey, revision: 6, signal: h.signal });
    await h.deps.prepareAgent({
      actor,
      files: [...h.input, published],
      sessionKey,
      revision: 4,
      signal: h.signal,
    });
    expect(h.host.getContext('worker', identity())).toBe(context);
    expect(context?.provisionState?.codeEnvFiles.map((entry) => entry.file_id)).toEqual(['input']);
  });

  it('joins an in-flight refresh before a later snapshot can retain a deleted publication', async () => {
    const h = harness({ setup: [] });
    const read = deferred<TFile[]>();
    try {
      await h.prepare();
      const published = await h.publishOutput();
      await h.host.session.prepareTools('worker', identity(), h.signal);
      const context = h.host.getContext('worker', identity());
      expect(context?.tool_resources?.execute_code?.files?.map((entry) => entry.file_id)).toContain(
        published.file_id,
      );
      h.saved.splice(0);
      h.listPublications.mockImplementationOnce(() => read.promise);
      const reads = h.listPublications.mock.calls.length;
      const refreshed = h.host.session.prepareTools('worker', identity(), h.signal);
      let snapshotSettled = false;
      const snapshot = h.host.session
        .prepareTools('worker', identity(), h.signal, 'snapshot')
        .then(() => {
          snapshotSettled = true;
        });
      await new Promise<void>((resolve) => setImmediate(resolve));
      const settledBeforeRead = snapshotSettled;
      read.resolve([]);
      await Promise.all([refreshed, snapshot]);

      const provisioned = await h.host.provisionPrepared(
        [Constants.EXECUTE_CODE],
        'worker',
        h.signal,
        identity(),
      );
      expect(settledBeforeRead).toBe(false);
      expect(h.listPublications).toHaveBeenCalledTimes(reads + 1);
      expect(h.host.getContext('worker', identity())).toBe(context);
      expect(provisioned?.map((entry) => entry.id)).toEqual(['remote-input']);
      expect(context?.tool_resources?.execute_code?.files?.map((entry) => entry.file_id)).toEqual([
        'input',
      ]);
    } finally {
      read.resolve([]);
      await h.host.session.close();
    }
  });

  it('serializes preparation with provisioning without blocking another execution', async () => {
    const h = harness({ setup: [] });
    const first = identity('first');
    const second = identity('second');
    await Promise.all([h.prepare(first), h.prepare(second)]);
    const entered = deferred<void>();
    const finish = deferred<void>();
    h.provisionToCodeEnv.mockImplementationOnce(async (params) => {
      entered.resolve();
      await finish.promise;
      return h.codeResult(params);
    });
    const upload = h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, first);
    await entered.promise;
    const before = h.host.getContext('worker', first)!;
    let refreshed = false;
    const refresh = h.deps
      .prepareAgent({
        actor: h.host.session.actorFor('worker', first),
        files: [...h.input, file('new')],
        sessionKey: before.codeExecutionContext!.codeSessionKey,
        revision: 100,
        signal: h.signal,
      })
      .then(() => {
        refreshed = true;
      });
    await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, second);
    expect(refreshed).toBe(false);
    finish.resolve();
    await Promise.all([upload, refresh]);
    expect(h.host.getContext('worker', first)).toBe(before);
    expect(before.tool_resources?.execute_code?.files?.map((entry) => entry.file_id)).toEqual([
      'input',
    ]);
    expect(before.provisionState?.codeEnvFiles.map((entry) => entry.file_id)).toEqual(['new']);
  });

  it('fails a setup load closed while another execution and a later retry succeed', async () => {
    const h = harness();
    h.loadFiles.mockRejectedValueOnce(new Error('Setup load failed'));
    const results = await Promise.allSettled([
      h.prepare(identity('first')),
      h.prepare(identity('second')),
    ]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled']);
    expect(h.host.getContext('worker', identity('first'))).toBeUndefined();
    expect(h.host.getContext('worker', identity('second'))).toBeDefined();
    expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
    await h.prepare(identity('first'));
    await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, identity('first'));
    expect(h.provisionToCodeEnv).toHaveBeenCalledTimes(2);
  });

  it('fails access errors closed and removes denied setup ids from runtime resources', async () => {
    const h = harness();
    h.filterFiles.mockRejectedValueOnce(new Error('ACL unavailable'));
    await expect(h.prepare()).rejects.toThrow('ACL unavailable');
    expect(h.host.getContext('worker', identity())).toBeUndefined();
    h.filterFiles.mockResolvedValue([]);
    await h.prepare();
    const context = h.host.getContext('worker', identity());
    expect(context?.tool_resources?.execute_code?.file_ids).toEqual([]);
    expect(context?.tool_resources?.file_search?.file_ids).toEqual([]);
    expect(context?.provisionState?.agentScopedFileIds).toEqual(new Set());
    await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, identity());
    expect(h.provisionToCodeEnv.mock.calls.map(([params]) => params.file.file_id)).toEqual([
      'input',
    ]);
  });

  it('applies one endpoint size budget to current inputs and setup files', async () => {
    const h = harness({
      inputs: [file('input', { bytes: 600_000 })],
      setup: [file('worker-setup', { bytes: 600_000, context: FileContext.agents })],
    });
    if (!h.req.config) throw new Error('Missing test configuration');
    h.req.config.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
    await expect(h.prepare()).rejects.toThrow('not supported by the receiving agent');
    expect(h.host.getContext('worker', identity())).toBeUndefined();
    expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
  });

  it.each(['resource', 'code queue', 'search queue'] as const)(
    'includes retained root files from the %s in the shared-file budget',
    async (location) => {
      const h = harness({ inputs: [file('input', { bytes: 600_000 })], setup: [] });
      h.req.config!.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
      const retained = file('retained', { bytes: 600_000 });
      const root = h.contexts.get('parent')!;
      root.tool_resources = {
        execute_code: { files: location === 'resource' ? [retained] : [] },
      };
      root.provisionState = {
        codeEnvFiles: location === 'code queue' ? [retained] : [],
        vectorDBFiles: location === 'search queue' ? [retained] : [],
        aliveFileIds: new Set(),
        agentScopedFileIds: new Set(),
      };
      const resources = structuredClone(root.tool_resources);
      const queues = structuredClone({
        codeEnvFiles: root.provisionState.codeEnvFiles,
        vectorDBFiles: root.provisionState.vectorDBFiles,
      });
      try {
        await expect(h.host.session.prepareTools('parent', undefined, h.signal)).rejects.toThrow(
          'not supported by the receiving agent',
        );
        expect(root.tool_resources).toEqual(resources);
        expect(root.provisionState).toMatchObject(queues);
        expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
        expect(h.loadFiles).not.toHaveBeenCalled();

        retained.bytes = 400_000;
        await h.host.session.prepareTools('parent', undefined, h.signal);
        expect(root.provisionState?.codeEnvFiles.map((entry) => entry.file_id)).toContain('input');
      } finally {
        await h.host.session.close();
      }
    },
  );

  it('counts retained root files once across resources, queues and the current manifest', async () => {
    const current = file('input', { bytes: 600_000 });
    const retained = file('retained', { bytes: 400_000 });
    const h = harness({ inputs: [current], setup: [] });
    h.req.config!.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
    const root = h.contexts.get('parent')!;
    root.tool_resources = {
      execute_code: { files: [retained, current] },
      file_search: { files: [retained] },
    };
    root.provisionState = {
      codeEnvFiles: [retained, current],
      vectorDBFiles: [retained],
      aliveFileIds: new Set(),
      agentScopedFileIds: new Set(),
    };
    try {
      await h.host.session.prepareTools('parent', undefined, h.signal);
      await h.host.session.prepareTools('parent', undefined, h.signal);
      expect(root.provisionState.codeEnvFiles.map((entry) => entry.file_id)).toEqual([
        'retained',
        'input',
      ]);

      root.provisionState.vectorDBFiles.push(file('later-setup', { bytes: 100_000 }));
      await expect(h.host.session.prepareTools('parent', undefined, h.signal)).rejects.toThrow(
        'not supported by the receiving agent',
      );
    } finally {
      await h.host.session.close();
    }
  });

  it('releases the root budget when a previous publication is removed', async () => {
    const h = harness({ inputs: [], setup: [] });
    h.req.config!.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
    const root = h.contexts.get('parent')!;
    root.tool_resources = { execute_code: { files: [file('retained', { bytes: 300_000 })] } };
    const preparation = {
      actor: h.host.session.actorFor('parent'),
      sessionKey: root.codeExecutionContext!.codeSessionKey,
      signal: h.signal,
    };
    try {
      await h.deps.prepareAgent({
        ...preparation,
        files: [file('old-publication', { bytes: 600_000 })],
        revision: 1,
      });
      await h.deps.prepareAgent({
        ...preparation,
        files: [file('new-publication', { bytes: 600_000 })],
        revision: 2,
      });
      expect(root.provisionState?.codeEnvFiles.map((entry) => entry.file_id)).toEqual([
        'new-publication',
      ]);
      expect(root.tool_resources.execute_code?.files?.map((entry) => entry.file_id)).toEqual([
        'retained',
      ]);
    } finally {
      await h.host.session.close();
    }
  });

  it('counts a current attachment also present in agent setup only once', async () => {
    const shared = file('same-file', { bytes: 600_000, context: FileContext.agents });
    const h = harness({ inputs: [shared], setup: [shared] });
    if (!h.req.config) throw new Error('Missing test configuration');
    h.req.config.fileConfig = { endpoints: { openAI: { totalSizeLimit: 1 } } };
    await h.prepare();
    await h.host.provision([Constants.EXECUTE_CODE], 'worker', h.signal, identity());
    expect(h.provisionToCodeEnv).toHaveBeenCalledTimes(1);
  });

  it('rechecks the managed deployment when an unchanged snapshot is reused', async () => {
    const h = harness();
    await h.prepare();
    h.contexts.get('worker')!.codeExecutionContext!.executionRouteKey = 'different-deployment';
    await expect(h.host.session.prepareTools('worker', identity(), h.signal)).rejects.toThrow(
      'environment changed',
    );
    expect(h.provisionToCodeEnv).not.toHaveBeenCalled();
  });

  it('does not commit cancelled preparation and permits a new attempt', async () => {
    const h = harness();
    const entered = deferred<void>();
    const loaded = deferred<TFile[]>();
    h.loadFiles.mockImplementationOnce(async () => {
      entered.resolve();
      return loaded.promise;
    });
    const controller = new AbortController();
    const preparing = h.prepare(identity(), controller.signal);
    await entered.promise;
    controller.abort(new Error('cancel preparation'));
    loaded.resolve(h.setup);
    await expect(preparing).rejects.toThrow('cancel preparation');
    expect(h.host.getContext('worker', identity())).toBeUndefined();
    await h.prepare();
    expect(h.host.getContext('worker', identity())).toBeDefined();
  });

  it('rejects attached environments and preserves host deployment identity', async () => {
    const h = harness();
    const context = h.contexts.get('worker')!.codeExecutionContext!;
    const shared = {
      ...context,
      codeSessionKey: 'execution-session',
      runtimeSessionHint: 'execution-session',
    };
    expect(resolveRunFileCodeExecutionContext(context, shared)).toEqual(shared);
    expect(() =>
      resolveRunFileCodeExecutionContext({ ...context, executionRouteKey: 'other' }, shared),
    ).toThrow('environment changed');
    context.environmentType = 'attached';
    await expect(h.prepare()).rejects.toThrow('isolated managed');
    expect(h.loadFiles).not.toHaveBeenCalled();
  });
});
