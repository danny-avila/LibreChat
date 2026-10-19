import { getCodeEnvRefForProfile, resolveSandboxFilename } from 'librechat-data-provider';
import type { TFile, TurnFileConsumers, AgentToolResources } from 'librechat-data-provider';
import type { CodeEnvFile } from '@librechat/agents';
import type { CodeExecutionRoute } from '../provision/service';
import type { CodeExecutionContext } from '~/agents/execution';
import type { ProvisionState } from '~/agents/resources';
import {
  claimCodeDestination,
  createCodeDestinationSet,
  reserveCodeDestination,
  isImportedProjectFile,
  getCodeFileDestinationScope,
  sortCodeFilesByDestinationPriority,
} from './destinations';
import { appendCodeFileContextLine, getCodeFileContextLine, getCodeFileLocation } from './priming';
import { getCodeEnvUploadFilename } from './form';

/** Shared file state used by prompt construction and lazy provisioning. */
export interface ProvisionToolContext {
  provisionState?: ProvisionState;
  tool_resources?: AgentToolResources;
  /** Code API deployment this agent resolved, so uploads land where it will execute. */
  codeExecutionContext?: CodeExecutionRoute;
  /** Successful refs retained while another file in the same batch awaits retry. */
  pendingProvisionedCodeFiles?: CodeEnvFile[];
}

export interface CodeFileAgent extends ProvisionToolContext {
  id: string;
  fileConsumers?: TurnFileConsumers;
  codeExecutionContext?: CodeExecutionContext;
  dynamicToolContextMap?: Record<string, unknown>;
}

interface CodeFileUpload {
  file: TFile;
  destination: string;
}

function routeKey(context: ProvisionToolContext): string {
  return (
    context.codeExecutionContext?.executionRouteKey ??
    context.codeExecutionContext?.executionProfile ??
    'default'
  );
}

/** Live imports are replaceable mounts; this chat's paths survive partial expiry. */
function stageProjectImports(
  context: ProvisionToolContext,
  route: string,
  contexts: readonly ProvisionToolContext[],
): void {
  const state = context.provisionState;
  if (!state?.project) return;
  const queuedIds = new Set(state.codeEnvFiles.map((file) => file.file_id));
  const routeQueuedIds = new Set<string>();
  const liveFiles = context.tool_resources?.execute_code?.files ?? [];
  const destinations = createCodeDestinationSet();
  for (const candidate of contexts) {
    const candidateState = candidate.provisionState;
    const pendingFiles = candidateState?.codeEnvFiles ?? [];
    for (const file of pendingFiles) routeQueuedIds.add(file.file_id);
    for (const file of [
      ...pendingFiles,
      ...(candidate.tool_resources?.execute_code?.files ?? []),
    ]) {
      if (isImportedProjectFile(file, candidateState?.project)) continue;
      const name =
        candidateState?.codeEnvDestinations?.get(file.file_id) ??
        getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
        candidateState?.codeEnvRecoveryNames?.get(file.file_id)?.name ??
        resolveSandboxFilename(file.filename, file.type);
      reserveCodeDestination(destinations, name);
    }
  }
  for (const file of sortCodeFilesByDestinationPriority(
    liveFiles,
    state.agentScopedFileIds,
    state.project,
  )) {
    if (!file || queuedIds.has(file.file_id) || !isImportedProjectFile(file, state.project))
      continue;
    const name =
      getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
      resolveSandboxFilename(file.filename, file.type);
    if (!routeQueuedIds.has(file.file_id) && reserveCodeDestination(destinations, name)) continue;
    state.codeEnvFiles.push(file);
    queuedIds.add(file.file_id);
  }
}

/** Uses the same destination plan before inference and when files are uploaded lazily. */
export function planCodeFileUploads({
  context,
  contexts,
  agentId,
  userId,
  useAdvertisedNames = false,
}: {
  context: ProvisionToolContext;
  contexts: Iterable<ProvisionToolContext>;
  agentId?: string;
  userId?: string;
  useAdvertisedNames?: boolean;
}): CodeFileUpload[] {
  const state = context.provisionState;
  if (!state) return [];
  const route = routeKey(context);
  const routeContexts = [...contexts].filter((candidate) => routeKey(candidate) === route);
  if (!routeContexts.includes(context)) routeContexts.push(context);
  // Stage the whole route before any agent freezes names, including live-only agents.
  for (const candidate of routeContexts) stageProjectImports(candidate, route, routeContexts);
  if (!state.codeEnvFiles.length) return [];
  const queuedIds = new Set(state.codeEnvFiles.map((file) => file.file_id));
  const liveFiles = context.tool_resources?.execute_code?.files ?? [];
  const privateIds = new Set<string>();
  const queued = new Map<string, { file: TFile; recoveryName?: string; advertisedName?: string }>();
  for (const candidate of routeContexts) {
    for (const id of candidate.provisionState?.agentScopedFileIds ?? []) privateIds.add(id);
    for (const file of candidate.provisionState?.codeEnvFiles ?? []) {
      if (queued.has(file.file_id)) continue;
      queued.set(file.file_id, {
        file,
        recoveryName: candidate.provisionState?.codeEnvRecoveryNames?.get(file.file_id)?.name,
        advertisedName: candidate.provisionState?.codeEnvDestinations?.get(file.file_id),
      });
    }
  }

  const confirmedNames = new Set<string>();
  const files = sortCodeFilesByDestinationPriority(
    [...state.codeEnvFiles, ...liveFiles.filter((file) => !queuedIds.has(file.file_id))],
    privateIds,
    state.project,
  ).filter((file): file is TFile => {
    if (!file) return false;
    const ref = getCodeEnvRefForProfile(file.metadata, route);
    const recovery = state.codeEnvRecoveryNames?.get(file.file_id);
    const entityId = state.agentScopedFileIds.has(file.file_id) ? agentId : undefined;
    const isTargetScope =
      ref != null && ref.kind === (entityId ? 'agent' : 'user') && ref.id === (entityId ?? userId);
    let storedName = recovery?.isTargetScope ? recovery.name : undefined;
    if (isTargetScope) storedName = ref?.sandboxFilename;
    // Equal stored paths identify superseded content; prefix conflicts remain separate inputs.
    if (storedName == null) return true;
    const destination = JSON.stringify([
      getCodeFileDestinationScope(file, state.project),
      storedName,
    ]);
    if (confirmedNames.has(destination)) return false;
    confirmedNames.add(destination);
    return true;
  });

  const destinations = createCodeDestinationSet();
  const liveNames = new Map<string, string>();
  const reserveLiveFiles = (candidate: ProvisionToolContext): void => {
    const candidateQueuedIds = new Set(
      candidate.provisionState?.codeEnvFiles.map((file) => file.file_id),
    );
    for (const file of candidate.tool_resources?.execute_code?.files ?? []) {
      if (
        candidateQueuedIds.has(file.file_id) ||
        (isImportedProjectFile(file, candidate.provisionState?.project) && queued.has(file.file_id))
      )
        continue;
      const name =
        getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
        candidate.provisionState?.codeEnvDestinations?.get(file.file_id) ??
        resolveSandboxFilename(file.filename, file.type);
      if (reserveCodeDestination(destinations, name) && !liveNames.has(file.file_id)) {
        liveNames.set(file.file_id, name);
      }
    }
  };
  // Foreign live paths can be reused only after this agent's immutable mounts claim theirs.
  reserveLiveFiles(context);
  for (const candidate of routeContexts) {
    if (candidate !== context) reserveLiveFiles(candidate);
  }
  for (const file of context.pendingProvisionedCodeFiles ?? []) {
    claimCodeDestination(destinations, file.name, file.id);
  }

  const queuedFiles = files.filter((file) => queuedIds.has(file.file_id));
  const selected = new Map(queuedFiles.map((file) => [file.file_id, file]));
  const advertisedNames = new Map<string, string>();
  if (useAdvertisedNames) {
    // An agent's frozen plan survives later discovery in other execution contexts.
    for (const [id, name] of state.codeEnvDestinations ?? []) {
      if (!queued.has(id)) continue;
      reserveCodeDestination(destinations, name);
      advertisedNames.set(id, name);
    }
    // Inherited paths are hints until checked against this agent's live mounts.
    for (const [id, candidate] of queued) {
      if (advertisedNames.has(id) || liveNames.has(id)) continue;
      const name = candidate.advertisedName;
      if (name != null && reserveCodeDestination(destinations, name)) {
        advertisedNames.set(id, name);
      }
    }
  }
  const uploads: CodeFileUpload[] = [];
  const temporaryCodeFileIds = new Set<string>();
  // Assign across the route's queued inputs, but expose only this agent's selected files.
  for (const file of sortCodeFilesByDestinationPriority(
    [...queued.values()].map((candidate) => candidate.file),
    privateIds,
    state.project,
  )) {
    if (!file) continue;
    const candidate = queued.get(file.file_id);
    const destination =
      advertisedNames.get(file.file_id) ??
      liveNames.get(file.file_id) ??
      claimCodeDestination(
        destinations,
        getCodeEnvUploadFilename(
          resolveSandboxFilename(
            getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
              candidate?.recoveryName ??
              file.filename,
            file.type,
          ),
        ),
        file.file_id,
      );
    const selectedFile = selected.get(file.file_id);
    if (selectedFile) {
      uploads.push({ file: selectedFile, destination });
      const canonicalName = getCodeEnvUploadFilename(
        resolveSandboxFilename(
          getCodeEnvRefForProfile(file.metadata, route)?.sandboxFilename ??
            candidate?.recoveryName ??
            file.filename,
          file.type,
        ),
      );
      if (
        isImportedProjectFile(file, state.project) &&
        (state.temporaryCodeFileIds?.has(file.file_id) === true || destination !== canonicalName)
      ) {
        temporaryCodeFileIds.add(file.file_id);
      }
    }
  }
  state.temporaryCodeFileIds = temporaryCodeFileIds;
  return uploads;
}

/** Adds metadata independently of extracted text, using only already-authorized file queues. */
export function prepareQueuedCodeFileContext(
  agent: CodeFileAgent,
  contexts: Iterable<ProvisionToolContext>,
  userId?: string,
  useAdvertisedNames = false,
): void {
  const key = 'queued_code_files';
  if (agent.dynamicToolContextMap) delete agent.dynamicToolContextMap[key];
  if (agent.fileConsumers?.executeCode !== true || !agent.provisionState) return;
  const uploads = planCodeFileUploads({
    context: agent,
    contexts,
    agentId: agent.id,
    userId,
    useAdvertisedNames,
  });
  agent.provisionState.codeEnvDestinations = new Map(
    uploads.map(({ file, destination }) => [file.file_id, destination]),
  );
  const location = getCodeFileLocation(agent.codeExecutionContext);
  let context = '';
  for (const { file, destination } of uploads) {
    context = appendCodeFileContextLine(
      context,
      getCodeFileContextLine(
        file,
        agent.provisionState.agentScopedFileIds,
        destination,
        location,
        agent.provisionState.project,
      ),
      location,
    );
  }
  if (!context) return;
  agent.dynamicToolContextMap ??= {};
  agent.dynamicToolContextMap[key] =
    `${context}\nFiles are staged at these paths on demand for code execution. ` +
    'You can read or edit them even when their extracted text is already in context.';
}
