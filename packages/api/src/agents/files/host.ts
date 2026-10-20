import {
  EToolResources,
  getCodeEnvRefs,
  getCodeEnvRefForProfile,
  resolveSandboxFilename,
} from 'librechat-data-provider';
import type { CodeEnvFile, SubagentExecutionContext } from '@librechat/agents';
import type { Agent, TFile } from 'librechat-data-provider';
import type {
  THasEntityEmbeddings,
  TFilterFilesByAgentAccess,
  TAdoptLegacySearchEmbeddings,
} from '~/agents/resources';
import type { ProvisionCallbackDeps, ProvisionToolContext } from '~/files/provision/callback';
import type { ToolEndCallback, ToolEndCallbackMetadata } from '~/agents/handlers';
import type { CodeFileProjectScope } from '~/files/code/destinations';
import type { ProvisionedCodeFile } from '~/agents/codeFilesSession';
import type { RunFileSession, RunFileSessionDeps } from './session';
import type { CodeExecutionContext } from '~/agents/execution';
import type { ServerRequest } from '~/types';
import {
  isImportedProjectFile,
  createCodeDestinationSet,
  claimCodeDestination,
  reserveCodeDestination,
  sortCodeFilesByDestinationPriority,
} from '~/files/code/destinations';
import {
  getProjectCodeScope,
  getCodeFileContextLine,
  appendCodeFileContextLine,
  checkCodeFileActive,
  selectCodeFiles,
} from '~/files/code/priming';
import {
  createCodeApiUploadRegistry,
  withCodeApiUploadSlot,
  getCodeApiUploadOptions,
} from '~/utils/code';
import { resolveResendToolResources, partitionCommittedFiles } from '~/agents/initialize';
import { isCodeArtifactToolOutput, isCodeFileToolName } from '~/agents/tools';
import { createProvisionFilesCallback } from '~/files/provision/callback';
import { assertModelBoundContent } from '~/middleware/modelBoundContent';
import { addFileToResource, primeResources } from '~/agents/resources';
import { mergeCodeFilesIntoContext } from '~/agents/codeFilesSession';
import { filterFilesByEndpointRuntimeConfig } from '~/files/filter';
import { prepareQueuedCodeFileContext } from '~/files/code/queued';
import { getCodeEnvUploadFilename } from '~/files/code/form';
import { getTurnCodeEnvRef } from '~/files/code/references';
import { createRunFileSession } from './session';

export interface RunFileToolContext extends ProvisionToolContext {
  agent?: Agent;
  primedCodeFiles?: CodeEnvFile[];
  codeEnvAvailable?: boolean;
  codeExecutionContext?: CodeExecutionContext;
  dynamicToolContextMap?: Record<string, unknown>;
}

export interface RunFileHost<TContext extends RunFileToolContext = RunFileToolContext> {
  session: RunFileSession;
  getContext: (
    agentId: string,
    executionContext?: SubagentExecutionContext,
  ) => TContext | undefined;
  provision: (
    toolNames: string[],
    agentId: string,
    signal: AbortSignal,
    executionContext?: SubagentExecutionContext,
  ) => Promise<ProvisionedCodeFile[] | undefined>;
  /** Used immediately after the handler has authorized the current tool batch. */
  provisionPrepared: (
    toolNames: string[],
    agentId: string,
    signal: AbortSignal,
    executionContext?: SubagentExecutionContext,
  ) => Promise<ProvisionedCodeFile[] | undefined>;
  deliverToolEnd: (
    callback: ToolEndCallback,
    data: Parameters<ToolEndCallback>[0],
    metadata: ToolEndCallbackMetadata,
  ) => Promise<void>;
}

/** Overrides only the session identity; deployments and credentials remain host-resolved. */
export function resolveRunFileCodeExecutionContext(
  resolved: CodeExecutionContext,
  shared?: CodeExecutionContext,
): CodeExecutionContext {
  if (shared == null) return resolved;
  if (
    resolved.baseUrl !== shared.baseUrl ||
    resolved.executionProfile !== shared.executionProfile ||
    resolved.executionRouteKey !== shared.executionRouteKey ||
    resolved.environmentId !== shared.environmentId ||
    resolved.bridgeWorkerId !== shared.bridgeWorkerId ||
    resolved.environmentType === 'attached'
  ) {
    throw new Error('The shared-file execution environment changed during this run.');
  }
  return {
    ...resolved,
    codeSessionKey: shared.codeSessionKey,
    runtimeSessionHint: shared.runtimeSessionHint,
  };
}

export function createRunFileHost<TContext extends RunFileToolContext>({
  req,
  contexts,
  createdAt,
  inputFileIds,
  getInputs,
  loadFiles,
  filterFiles,
  validateMessages,
  encodeMessages,
  listPublications,
  snapshots,
  publish,
  emit,
  audit,
  provisioning,
}: {
  req: ServerRequest;
  contexts: Map<string, TContext>;
  createdAt: number;
  inputFileIds: ReadonlySet<string>;
  getInputs: () => readonly TFile[];
  loadFiles: (fileIds: string[]) => Promise<TFile[]>;
  filterFiles: TFilterFilesByAgentAccess;
  validateMessages: RunFileSessionDeps['validateMessages'];
  encodeMessages: RunFileSessionDeps['encodeMessages'];
  listPublications: RunFileSessionDeps['listPublications'];
  snapshots: RunFileSessionDeps['snapshots'];
  publish: RunFileSessionDeps['publish'];
  emit: RunFileSessionDeps['emit'];
  audit?: RunFileSessionDeps['audit'];
  provisioning: Pick<
    ProvisionCallbackDeps,
    | 'provisionToCodeEnv'
    | 'provisionToVectorDB'
    | 'updateFile'
    | 'updateCodeEnvRef'
    | 'addEmbeddedEntity'
    | 'getCodeFileInfo'
  > & {
    /** Lets setup files whose namespace is unrecorded be confirmed instead of embedded again. */
    hasEntityEmbeddings?: THasEntityEmbeddings;
    adoptLegacySearchEmbeddings?: TAdoptLegacySearchEmbeddings;
  };
}): RunFileHost<TContext> {
  const user = req.user;
  if (user == null) throw new Error('Run file sharing requires an authenticated user.');
  const userId = user.id;
  const executionContexts = new Map<string, TContext>();
  const prepared = new Map<
    string,
    {
      revision: number;
      signature: string;
      files: Map<string, TFile>;
      projectFiles: Map<string, TFile>;
      setupFiles: Map<string, TFile>;
      loadedSetupIds: Set<string>;
    }
  >();
  const provisioningCallbacks = new Map<string, ReturnType<typeof createProvisionFilesCallback>>();
  const operations = new Map<string, Promise<unknown>>();
  const probeRegistry = req.app?.locals?.codeApiUploadRegistry ?? createCodeApiUploadRegistry();
  const rootCodeFiles = new Map<string, Map<string, CodeEnvFile>>();
  const codeReplacements = new Map<
    string,
    Map<string, Map<string, { id: string; storage_session_id: string }>>
  >();
  const deliveredCodeFiles = new Map<string, Map<string, CodeEnvFile>>();
  const codeRefKey = (ref: { file_id: string; storage_session_id: string }) =>
    `${ref.storage_session_id}\0${ref.file_id}`;
  const codeFileKey = (ref: { file_id: string; storage_session_id: string }, name: string) =>
    `${codeRefKey(ref)}\0${name}`;
  const codeFileName = (
    context: RunFileToolContext,
    file: TFile,
    route: string,
    seeded?: ReadonlyMap<string, CodeEnvFile>,
  ): string => {
    const ref = getCodeEnvRefForProfile(file.metadata, route);
    return (
      context.provisionState?.project?.sessionPlan?.mountedNames.get(file.file_id) ??
      context.provisionState?.project?.sessionPlan?.destinations.get(file.file_id) ??
      context.provisionState?.codeEnvDestinations?.get(file.file_id) ??
      ref?.sandboxFilename ??
      (ref ? seeded?.get(codeRefKey(ref))?.name : undefined) ??
      getCodeEnvUploadFilename(resolveSandboxFilename(file.filename, file.type))
    );
  };
  const seededLastModified = new Date(createdAt).toISOString();
  // Root and handoff partitions already receive these selected inputs in the graph seed.
  // Unselected resources and newly announced aliases still need delivery.
  for (const [agentId, context] of contexts) {
    const seeded = new Map<string, CodeEnvFile>();
    for (const file of context.primedCodeFiles ?? []) {
      seeded.set(
        codeRefKey({ file_id: file.id, storage_session_id: file.storage_session_id }),
        file,
      );
    }
    rootCodeFiles.set(agentId, seeded);
  }

  /** Priming and tool provisioning both mutate these queues. Other executions, even of
   * the same configured agent, have independent queues and can make progress together. */
  function serialize<T>(key: string, signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const previous = operations.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => {
        signal.throwIfAborted();
        return operation();
      });
    operations.set(key, current);
    const release = () => {
      if (operations.get(key) === current) operations.delete(key);
    };
    void current.then(release, release);
    return current;
  }

  function retainContext(key: string, agentId: string, context: TContext): void {
    executionContexts.set(key, context);
    if (!provisioningCallbacks.has(key)) {
      provisioningCallbacks.set(
        key,
        createProvisionFilesCallback({
          req,
          agentToolContexts: new Map([[agentId, context]]),
          ...provisioning,
        }),
      );
    }
  }

  async function prepareCodeFileContext(
    context: RunFileToolContext,
    agentId: string,
    signal: AbortSignal,
    inheritedProject?: CodeFileProjectScope,
    seeded?: ReadonlyMap<string, CodeEnvFile>,
  ): Promise<void> {
    const state = context.provisionState;
    const scope = state?.project;
    const plan = scope?.sessionPlan;
    if (!state || !scope || !plan) return;
    const files = new Map(
      [...state.codeEnvFiles, ...(context.tool_resources?.execute_code?.files ?? [])].map(
        (file) => [file.file_id, file],
      ),
    );
    if (!plan.frozen) {
      for (const [id, name] of inheritedProject?.sessionPlan?.mountedNames ?? []) {
        if (files.has(id)) plan.mountedNames.set(id, name);
      }
    }
    const claimed = createCodeDestinationSet();
    if (plan.frozen) {
      for (const name of plan.destinations.values()) reserveCodeDestination(claimed, name);
      for (const name of plan.mountedNames.values()) reserveCodeDestination(claimed, name);
    }
    const route =
      context.codeExecutionContext?.executionRouteKey ??
      context.codeExecutionContext?.executionProfile ??
      'default';
    const requiredCodeFiles = sortCodeFilesByDestinationPriority(
      [...files.values()],
      state.agentScopedFileIds,
      scope,
    ).filter(
      (file): file is TFile =>
        file != null &&
        !isImportedProjectFile(file, scope) &&
        (!plan.frozen || !plan.mountedNames.has(file.file_id)),
    );
    const storedNames = new Map<string, string>();
    const getCodeFileInfo = provisioning.getCodeFileInfo;
    const { scope: probeScope, concurrency } = getCodeApiUploadOptions(req, route);
    await Promise.all(
      requiredCodeFiles.map(async (file) => {
        const ref = getCodeEnvRefForProfile(file.metadata, route);
        if (!ref || ref.sandboxFilename) return;
        const seed = seeded?.get(codeRefKey(ref));
        if (seed) {
          storedNames.set(file.file_id, seed.name);
          return;
        }
        if (!getCodeFileInfo) return;
        const info = await withCodeApiUploadSlot({
          registry: probeRegistry,
          scope: probeScope,
          concurrency,
          signal,
          task: () => getCodeFileInfo(ref, context.codeExecutionContext ?? {}, signal),
        });
        if (info?.originalFilename && checkCodeFileActive(info.lastModified)) {
          storedNames.set(file.file_id, info.originalFilename);
        }
      }),
    );
    signal.throwIfAborted();
    for (const file of requiredCodeFiles) {
      const name =
        plan.mountedNames.get(file.file_id) ??
        storedNames.get(file.file_id) ??
        getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
        state.codeEnvDestinations?.get(file.file_id) ??
        getCodeEnvUploadFilename(resolveSandboxFilename(file.filename, file.type));
      plan.mountedNames.set(file.file_id, claimCodeDestination(claimed, name, file.file_id));
    }
    if (!plan.frozen) {
      for (const file of files.values()) {
        if (!isImportedProjectFile(file, scope)) continue;
        const name =
          inheritedProject?.sessionPlan?.destinations.get(file.file_id) ??
          state.codeEnvDestinations?.get(file.file_id) ??
          getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
          getCodeEnvUploadFilename(resolveSandboxFilename(file.filename, file.type));
        plan.destinations.set(file.file_id, claimCodeDestination(claimed, name, file.file_id));
      }
      plan.frozen = true;
    }
    const codeAgent = {
      ...context,
      id: agentId,
      fileConsumers: { executeCode: context.codeEnvAvailable === true, fileSearch: false },
      dynamicToolContextMap: { ...context.dynamicToolContextMap },
    };
    prepareQueuedCodeFileContext(codeAgent, [codeAgent], userId, true);
    context.dynamicToolContextMap = codeAgent.dynamicToolContextMap;
  }

  const session = createRunFileSession({
    policy: req.config?.endpoints?.agents?.fileSharing,
    userId: user.id,
    tenantId: user.tenantId,
    createdAt,
    inputFileIds,
    getInputs,
    getAgent: (agentId) => contexts.get(agentId)?.agent,
    listPublications,
    snapshots,
    publish,
    emit,
    audit,
    validateMessages,
    encodeMessages,
    getCodeFileContext: (actor) => {
      const context =
        executionContexts.get(JSON.stringify(actor)) ??
        (actor.executionId === session.actorFor(actor.agentId).executionId
          ? contexts.get(actor.agentId)
          : undefined);
      const state = context?.provisionState;
      if (!context || !state?.project) return undefined;
      const paths = new Map<string, string>();
      let note = '';
      const route =
        context.codeExecutionContext?.executionRouteKey ??
        context.codeExecutionContext?.executionProfile ??
        'default';
      for (const file of [
        ...state.codeEnvFiles,
        ...(context.tool_resources?.execute_code?.files ?? []),
      ]) {
        if (paths.has(file.file_id)) continue;
        const name =
          state.project.sessionPlan?.mountedNames.get(file.file_id) ??
          state.project.sessionPlan?.destinations.get(file.file_id) ??
          state.codeEnvDestinations?.get(file.file_id) ??
          getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename;
        if (!name) continue;
        paths.set(file.file_id, `/mnt/data/${name}`);
        if (state.project.projectFileIds.has(file.file_id)) {
          note = appendCodeFileContextLine(
            note,
            getCodeFileContextLine(file, state.agentScopedFileIds, name, 'sandbox', state.project),
          );
        }
      }
      return { paths, context: note };
    },
    prepareAgent: async ({ actor, files, revision, sessionKey, signal }) => {
      const key = JSON.stringify(actor);
      await serialize(key, signal, async () => {
        const previous = prepared.get(key);
        // Snapshots are numbered before their asynchronous reads. A late older read
        // cannot restore a removed grant or replace a newer actor's queues.
        if (previous != null && revision <= previous.revision) return;
        const source = contexts.get(actor.agentId);
        if (!source?.agent) throw new Error('The shared-file agent is no longer available.');
        const isRoot = actor.executionId === session.actorFor(actor.agentId).executionId;
        if (!isRoot && source.codeExecutionContext?.environmentType === 'attached') {
          throw new Error('Run file sharing requires an isolated managed code environment.');
        }
        const screen = (candidates: TFile[], consumedBytes = 0): TFile[] => {
          const admitted = filterFilesByEndpointRuntimeConfig(req.config, {
            files: candidates,
            endpoint: source.agent!.endpoint ?? source.agent!.provider ?? 'agents',
            preserveTextSources: true,
            consumedBytes,
          });
          if (admitted.length !== candidates.length) {
            throw new Error('A shared file is not supported by the receiving agent.');
          }
          assertModelBoundContent({ filters: req.config?.filters, files: admitted });
          return admitted;
        };
        const project = source.provisionState?.project;
        const authorizedProjectFiles =
          !isRoot &&
          req.config?.projects?.codeExecution === true &&
          source.codeEnvAvailable === true
            ? new Map(
                [
                  ...(source.provisionState?.codeEnvFiles ?? []),
                  ...(source.tool_resources?.execute_code?.files ?? []),
                ]
                  .filter((file) => project?.projectFileIds.has(file.file_id))
                  .map((file) => [file.file_id, file]),
              )
            : new Map<string, TFile>();
        // Initialization already applied project ownership and receiving-agent policies.
        // Reuse its canonical snapshot rather than a parent's temporary sandbox alias.
        for (const file of req.chatProjectFiles ?? []) {
          if (authorizedProjectFiles.has(file.file_id)) {
            authorizedProjectFiles.set(file.file_id, file);
          }
        }
        const signature = JSON.stringify([
          files.map((file) => file.file_id).sort(),
          [...authorizedProjectFiles.keys()].sort(),
        ]);
        const existingContext = executionContexts.get(key);
        if (isRoot) {
          // The root already passed normal conversation authorization and priming.
          // Sharing only limits what descendants inherit; its own historical files,
          // pending uploads and runtime session must survive activation and refresh.
          const context = existingContext ?? source;
          const existingFiles = new Map(
            [
              ...Object.values(context.tool_resources ?? {}).flatMap(
                (resource) => resource?.files ?? [],
              ),
              ...(context.provisionState?.codeEnvFiles ?? []),
              ...(context.provisionState?.vectorDBFiles ?? []),
              ...(previous?.files.values() ?? []),
            ].map((file) => [file.file_id, file]),
          );
          const currentIds = new Set(files.map((file) => file.file_id));
          let consumedBytes = 0;
          for (const file of existingFiles.values()) {
            if (!currentIds.has(file.file_id) && !previous?.files.has(file.file_id)) {
              consumedBytes += file.bytes;
            }
          }
          screen(files, consumedBytes);
          if (previous?.signature === signature) {
            previous.revision = revision;
            return;
          }
          const currentFiles = files.map(
            (file) => existingFiles.get(file.file_id) ?? structuredClone(file),
          );
          const removed = new Set(
            [...(previous?.files.keys() ?? [])].filter((id) => !currentIds.has(id)),
          );
          const added = currentFiles.filter((file) => !existingFiles.has(file.file_id));
          const primed = await primeResources({
            req,
            appConfig: req.config,
            agentId: actor.agentId,
            attachments: Promise.resolve(added),
            requestFileSet: new Set(added.map((file) => file.file_id)),
            tool_resources: undefined,
            getFiles: async () => [],
            enabledToolResources: resolveResendToolResources({
              tools: source.agent.tools ?? [],
              codeEnvAvailable: source.codeEnvAvailable === true,
            }),
            codeRouteKey:
              context.codeExecutionContext?.executionRouteKey ??
              context.codeExecutionContext?.executionProfile,
            codeBaseUrl: context.codeExecutionContext?.baseUrl,
          });
          signal.throwIfAborted();
          const resources = context.tool_resources ?? {};
          for (const resource of Object.values(resources)) {
            if (resource?.files)
              resource.files = resource.files.filter((file: TFile) => !removed.has(file.file_id));
            if (resource?.file_ids)
              resource.file_ids = resource.file_ids.filter((id: string) => !removed.has(id));
          }
          const processedResourceFiles = new Set<string>();
          for (const [type, resource] of Object.entries(primed.tool_resources ?? {})) {
            for (const file of resource?.files ?? [])
              addFileToResource({
                file,
                resourceType: type as EToolResources,
                tool_resources: resources,
                processedResourceFiles,
              });
          }
          context.tool_resources = resources;
          const state = context.provisionState ?? primed.provisionState;
          if (state) {
            const merge = (existing: TFile[], incoming: TFile[]) => [
              ...new Map(
                [...existing.filter((file) => !removed.has(file.file_id)), ...incoming].map(
                  (file) => [file.file_id, file],
                ),
              ).values(),
            ];
            state.codeEnvFiles = merge(
              state.codeEnvFiles,
              primed.provisionState?.codeEnvFiles ?? [],
            );
            state.vectorDBFiles = merge(
              state.vectorDBFiles,
              primed.provisionState?.vectorDBFiles ?? [],
            );
            context.provisionState = state;
          }
          await prepareCodeFileContext(
            context,
            actor.agentId,
            signal,
            undefined,
            rootCodeFiles.get(actor.agentId),
          );
          const removedCodeIds = new Set(
            [...removed].flatMap((id) =>
              getCodeEnvRefs(previous?.files.get(id)?.metadata).map(([, ref]) => ref.file_id),
            ),
          );
          context.pendingProvisionedCodeFiles = context.pendingProvisionedCodeFiles?.filter(
            (file) => !removedCodeIds.has(file.id),
          );
          retainContext(key, actor.agentId, context);
          prepared.set(key, {
            revision,
            signature,
            files: new Map(currentFiles.map((file) => [file.file_id, file])),
            projectFiles: new Map(),
            setupFiles: new Map(),
            loadedSetupIds: new Set(),
          });
          return;
        }
        screen(files);
        const codeExecutionContext =
          source.codeExecutionContext == null
            ? undefined
            : resolveRunFileCodeExecutionContext(source.codeExecutionContext, {
                ...source.codeExecutionContext,
                codeSessionKey: sessionKey,
                runtimeSessionHint: sessionKey,
              });
        if (codeExecutionContext && existingContext?.codeExecutionContext) {
          resolveRunFileCodeExecutionContext(
            codeExecutionContext,
            existingContext.codeExecutionContext,
          );
        }
        if (previous?.signature === signature) {
          previous.revision = revision;
          return;
        }
        // Unified input records are immutable for this run. Keep this actor's local
        // provisioning results, which may be newer than a manifest or database read.
        const currentFiles = files.map(
          (file) => previous?.files.get(file.file_id) ?? structuredClone(file),
        );
        let projectFiles = [...authorizedProjectFiles.values()].map(
          (file) => previous?.projectFiles.get(file.file_id) ?? structuredClone(file),
        );
        const setupFiles = previous?.setupFiles ?? new Map<string, TFile>();
        const loadedSetupIds = previous?.loadedSetupIds ?? new Set<string>();
        const admittedSetupIds = new Set<string>();
        let failed: { error: unknown } | undefined;
        const primed = await primeResources({
          req,
          appConfig: req.config,
          agentId: actor.agentId,
          attachments: Promise.resolve(currentFiles),
          projectCodeFiles: projectFiles,
          requestFileSet: new Set(currentFiles.map((file) => file.file_id)),
          tool_resources: source.agent.tool_resources,
          hasEntityEmbeddings: provisioning.hasEntityEmbeddings,
          adoptLegacySearchEmbeddings: provisioning.adoptLegacySearchEmbeddings,
          enabledToolResources: resolveResendToolResources({
            tools: source.agent.tools ?? [],
            codeEnvAvailable: source.codeEnvAvailable === true,
          }),
          getFiles: async (filter) => {
            try {
              const ids = (filter as { file_id: { $in: string[] } }).file_id.$in;
              const missing = ids.filter((id) => !loadedSetupIds.has(id));
              if (missing.length > 0) {
                const loaded = await loadFiles(missing);
                const requested = new Set(missing);
                for (const file of loaded) {
                  if (requested.has(file.file_id))
                    setupFiles.set(file.file_id, structuredClone(file));
                }
                for (const id of missing) loadedSetupIds.add(id);
              }
              return ids.flatMap((id) => {
                const file = setupFiles.get(id);
                return file ? [file] : [];
              });
            } catch (error) {
              failed = { error };
              throw error;
            }
          },
          filterFiles: async (params) => {
            try {
              return await filterFiles(params);
            } catch (error) {
              failed = { error };
              throw error;
            }
          },
          codeRouteKey:
            codeExecutionContext?.executionRouteKey ?? codeExecutionContext?.executionProfile,
          codeBaseUrl: codeExecutionContext?.baseUrl,
          screenPersistentFiles: (candidates) => {
            try {
              const candidateIds = new Set(candidates.map((file) => file.file_id));
              const consumedBytes = currentFiles.reduce(
                (total, file) => total + (candidateIds.has(file.file_id) ? 0 : file.bytes),
                0,
              );
              const admitted = screen(candidates, consumedBytes);
              for (const file of admitted) admittedSetupIds.add(file.file_id);
              return admitted;
            } catch (error) {
              failed = { error };
              throw error;
            }
          },
          screenProjectFiles: (candidates, persistedFiles) => {
            const required = new Map(
              [...currentFiles, ...persistedFiles].map((file) => [file.file_id, file]),
            );
            const { committed, pending } = partitionCommittedFiles(
              [...candidates],
              [...required.values()],
            );
            projectFiles = committed.concat(
              filterFilesByEndpointRuntimeConfig(req.config, {
                files: pending,
                endpoint: source.agent!.endpoint ?? source.agent!.provider ?? 'agents',
                preserveTextSources: true,
                consumedBytes: [...required.values()].reduce(
                  (total, file) => total + file.bytes,
                  0,
                ),
              }),
            );
            assertModelBoundContent({ filters: req.config?.filters, files: projectFiles });
            return projectFiles;
          },
        });
        // primeResources supports a best-effort legacy caller. A shared-file host
        // must fail closed when its authorized resource load or policy check fails.
        if (failed) throw failed.error;
        signal.throwIfAborted();
        const projectIds = new Set(projectFiles.map((file) => file.file_id));
        const admittedIds = new Set([
          ...currentFiles.map((file) => file.file_id),
          ...projectIds,
          ...admittedSetupIds,
        ]);
        for (const resource of Object.values(primed.tool_resources ?? {})) {
          if (resource?.file_ids) {
            resource.file_ids = resource.file_ids.filter((id: string) => admittedIds.has(id));
          }
        }
        const provisionState =
          primed.provisionState ??
          (source.codeEnvAvailable === true || existingContext?.provisionState
            ? {
                ...existingContext?.provisionState,
                codeEnvFiles: [],
                vectorDBFiles: [],
                aliveFileIds: new Set<string>(),
                agentScopedFileIds: new Set<string>(),
                codeEnvRecoveryNames: undefined,
              }
            : undefined);
        if (provisionState) {
          provisionState.agentScopedFileIds = new Set(
            [...admittedSetupIds].filter((id) => !projectIds.has(id)),
          );
          const destinations = new Map<string, string>();
          for (const planned of [
            source.provisionState?.codeEnvDestinations,
            existingContext?.provisionState?.codeEnvDestinations,
          ]) {
            for (const [fileId, destination] of planned ?? []) {
              if (admittedIds.has(fileId)) destinations.set(fileId, destination);
            }
          }
          provisionState.codeEnvDestinations = destinations;
          const scope =
            source.codeEnvAvailable === true ? getProjectCodeScope(req, sessionKey) : undefined;
          if (scope?.sessionPlan && (projectFiles.length > 0 || scope.sessionPlan.frozen)) {
            provisionState.project = { ...scope, projectFileIds: projectIds };
          }
        }
        const context: TContext = existingContext ?? {
          ...source,
          pendingProvisionedCodeFiles: undefined,
        };
        context.tool_resources = primed.tool_resources;
        context.provisionState = provisionState;
        context.codeExecutionContext = codeExecutionContext;
        context.codeSessionKey = codeExecutionContext?.codeSessionKey;
        await prepareCodeFileContext(context, actor.agentId, signal, project);
        if (context.pendingProvisionedCodeFiles) {
          const currentCodeIds = new Set(
            [
              ...currentFiles,
              ...projectFiles,
              ...[...admittedSetupIds].flatMap((id) => setupFiles.get(id) ?? []),
            ].flatMap((file) => getCodeEnvRefs(file.metadata).map(([, ref]) => ref.file_id)),
          );
          context.pendingProvisionedCodeFiles = context.pendingProvisionedCodeFiles.filter((file) =>
            currentCodeIds.has(file.id),
          );
        }
        retainContext(key, actor.agentId, context);
        prepared.set(key, {
          revision,
          signature,
          files: new Map(currentFiles.map((file) => [file.file_id, file])),
          projectFiles: new Map(projectFiles.map((file) => [file.file_id, file])),
          setupFiles,
          loadedSetupIds,
        });
      });
    },
  });

  function getContext(
    agentId: string,
    executionContext?: SubagentExecutionContext,
  ): TContext | undefined {
    if (!session.isActive()) return contexts.get(agentId);
    return executionContexts.get(JSON.stringify(session.actorFor(agentId, executionContext)));
  }

  async function provision(
    toolNames: string[],
    agentId: string,
    signal: AbortSignal,
    executionContext?: SubagentExecutionContext,
  ) {
    if (!session.isActive()) return undefined;
    await session.prepareTools(agentId, executionContext, signal);
    return provisionPrepared(toolNames, agentId, signal, executionContext);
  }

  async function provisionPrepared(
    toolNames: string[],
    agentId: string,
    signal: AbortSignal,
    executionContext?: SubagentExecutionContext,
  ): Promise<ProvisionedCodeFile[] | undefined> {
    if (!session.isActive()) return undefined;
    const actor = session.actorFor(agentId, executionContext);
    const key = JSON.stringify(actor);
    const seeded =
      actor.executionId === session.actorFor(agentId).executionId
        ? rootCodeFiles.get(agentId)
        : undefined;
    if (!prepared.has(key)) throw new Error('The shared-file execution has not been prepared.');
    return serialize(key, signal, async () => {
      const context = executionContexts.get(key);
      const state = context?.provisionState;
      const liveCodeFiles: CodeEnvFile[] = [];
      const deliverySources = new Map<string, TFile>();
      const deliveredFileIds = new Map<string, string>();
      const replacedRefs = codeReplacements.get(key) ?? new Map();
      codeReplacements.set(key, replacedRefs);
      const previousDeliveries = deliveredCodeFiles.get(key) ?? new Map();
      deliveredCodeFiles.set(key, previousDeliveries);
      const rememberRef = (
        fileId: string,
        ref: { file_id: string; storage_session_id: string } | undefined,
      ): void => {
        if (!ref) return;
        const refs = replacedRefs.get(fileId) ?? new Map();
        refs.set(codeRefKey(ref), {
          id: ref.file_id,
          storage_session_id: ref.storage_session_id,
        });
        replacedRefs.set(fileId, refs);
      };
      const route =
        context?.codeExecutionContext?.executionRouteKey ??
        context?.codeExecutionContext?.executionProfile ??
        'default';
      if (context?.codeEnvAvailable === true && state && toolNames.some(isCodeFileToolName)) {
        const queuedIds = new Set(state.codeEnvFiles.map((file) => file.file_id));
        for (const file of [
          ...state.codeEnvFiles,
          ...(context.tool_resources?.execute_code?.files ?? []),
        ]) {
          if (!deliverySources.has(file.file_id)) deliverySources.set(file.file_id, file);
          const name = codeFileName(context, file, route, seeded);
          for (const ref of [
            getCodeEnvRefForProfile(file.metadata, route),
            getTurnCodeEnvRef(req, route, file, name),
          ]) {
            rememberRef(file.file_id, ref);
          }
        }
        const { scope: probeScope, concurrency } = getCodeApiUploadOptions(req, route);
        const selectionFiles = (context.tool_resources?.execute_code?.files ?? []).filter(
          (file) => !queuedIds.has(file.file_id),
        );
        const { selected } = await selectCodeFiles({
          files: selectionFiles,
          privateFileIds: state.agentScopedFileIds,
          project: state.project,
          getTurnRef: (file, destination) => getTurnCodeEnvRef(req, route, file, destination),
          routeKey: route,
          getFileInfo: async (ref) => {
            const seed = seeded?.get(codeRefKey(ref));
            if (seed) {
              return { lastModified: seededLastModified, originalFilename: seed.name };
            }
            return withCodeApiUploadSlot({
              registry: probeRegistry,
              scope: probeScope,
              concurrency,
              signal,
              task: async () =>
                provisioning.getCodeFileInfo?.(ref, context.codeExecutionContext ?? {}, signal) ??
                null,
            });
          },
          concurrency,
          signal,
        });
        const selectedIds = new Set(selected.map((candidate) => candidate.file.file_id));
        const supersededFiles = new Map<string, CodeEnvFile[]>();
        for (const file of selectionFiles) {
          if (selectedIds.has(file.file_id)) continue;
          const name = codeFileName(context, file, route, seeded);
          const canonicalRef = getCodeEnvRefForProfile(file.metadata, route);
          const turnRef = getTurnCodeEnvRef(req, route, file, name);
          for (const previous of [
            previousDeliveries.get(file.file_id),
            canonicalRef ? seeded?.get(codeRefKey(canonicalRef)) : undefined,
            turnRef ? seeded?.get(codeRefKey(turnRef)) : undefined,
          ]) {
            if (!previous) continue;
            const losers = supersededFiles.get(previous.name) ?? [];
            losers.push(previous);
            supersededFiles.set(previous.name, losers);
          }
        }
        for (const candidate of selected) {
          rememberRef(candidate.file.file_id, candidate.sourceRef);
          rememberRef(candidate.file.file_id, candidate.ref);
          // Only a selection loser may cede its delivered path to a different record.
          for (const previous of supersededFiles.get(candidate.sandboxName) ?? []) {
            rememberRef(candidate.file.file_id, {
              file_id: previous.id,
              storage_session_id: previous.storage_session_id,
            });
          }
          if (!candidate.isActive || !candidate.ref) {
            state.codeEnvFiles.push(candidate.file);
            state.codeEnvDestinations ??= new Map();
            state.codeEnvDestinations.set(candidate.file.file_id, candidate.sandboxName);
            if (candidate.temporary) {
              state.temporaryCodeFileIds = new Set([
                ...(state.temporaryCodeFileIds ?? []),
                candidate.file.file_id,
              ]);
            }
            continue;
          }
          const ref = candidate.ref;
          if (seeded?.get(codeRefKey(ref))?.name === candidate.sandboxName) continue;
          deliveredFileIds.set(codeFileKey(ref, candidate.sandboxName), candidate.file.file_id);
          const codeFile = {
            id: ref.file_id,
            resource_id: ref.id,
            storage_session_id: ref.storage_session_id,
            name: candidate.sandboxName,
          };
          liveCodeFiles.push(
            ref.kind === 'skill'
              ? { ...codeFile, kind: ref.kind, version: ref.version }
              : { ...codeFile, kind: ref.kind },
          );
        }
      }
      const provisioned = await provisioningCallbacks.get(key)?.(toolNames, agentId, signal);
      if (context && provisioned?.length) {
        for (const file of deliverySources.values()) {
          const name = codeFileName(context, file, route, seeded);
          const ref =
            getTurnCodeEnvRef(req, route, file, name) ??
            getCodeEnvRefForProfile(file.metadata, route);
          if (ref) {
            deliveredFileIds.set(codeFileKey(ref, ref.sandboxFilename ?? name), file.file_id);
          }
        }
      }
      // An isolated child has no entry under its new SDK session key. Live setup files
      // must travel with uploads instead of relying on the original graph's seed.
      const delivered = mergeCodeFilesIntoContext(undefined, [
        ...liveCodeFiles,
        ...(provisioned ?? []),
      ])?.files;
      return delivered?.map((file) => {
        const fileId = deliveredFileIds.get(
          codeFileKey({ file_id: file.id, storage_session_id: file.storage_session_id }, file.name),
        );
        if (fileId) previousDeliveries.set(fileId, file);
        const replaces = [...(fileId ? (replacedRefs.get(fileId)?.values() ?? []) : [])].filter(
          (ref) => ref.id !== file.id || ref.storage_session_id !== file.storage_session_id,
        );
        return replaces?.length ? { ...file, replaces } : file;
      });
    });
  }

  const deliverToolEnd = async (
    callback: ToolEndCallback,
    data: Parameters<ToolEndCallback>[0],
    metadata: ToolEndCallbackMetadata,
  ): Promise<void> => {
    const executionContext = metadata.executionContext as SubagentExecutionContext | undefined;
    if (!session.isActive() || executionContext == null) return callback(data, metadata);
    if (!isCodeArtifactToolOutput(data.output) && !isCodeFileToolName(data.output.name)) {
      return callback(data, metadata);
    }
    const agentId = metadata.executingAgentId ?? metadata.agentId ?? metadata.agent_id;
    if (typeof agentId !== 'string')
      throw new Error('The shared-file producer has no agent identity.');
    const context = getContext(agentId, executionContext);
    if (!context) throw new Error('The shared-file producer has no execution context.');
    if (data.output.artifact == null || typeof data.output.artifact !== 'object') return;
    await session.capture(
      agentId,
      executionContext,
      data.output.tool_call_id,
      data.output.artifact as Parameters<typeof session.capture>[3],
      context.codeExecutionContext,
    );
  };

  return { session, getContext, provision, provisionPrepared, deliverToolEnd };
}
