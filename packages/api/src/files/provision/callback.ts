import { Constants } from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import { EToolResources } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';
import type { ProvisionState } from '~/agents/resources';
import type { ProvisionService } from './service';
import type { ServerRequest } from '~/types';
import { isAgentScopedFile } from '~/agents/resources';
import { CREATE_FILE_TOOL_NAME } from '~/agents/tools';

/** Deferred database write produced by a successful provisioning call. */
interface FileUpdate {
  file_id: string;
  metadata?: Record<string, unknown>;
  embedded?: boolean;
}

/** The slice of a per-agent tool context this callback reads and updates. */
export interface ProvisionToolContext {
  provisionState?: ProvisionState;
  tool_resources?: AgentToolResources;
}

export interface ProvisionCallbackDeps {
  req: ServerRequest;
  agentToolContexts: Map<string, ProvisionToolContext>;
  resolvePrimaryAgentId?: () => string | undefined;
  provisionToCodeEnv: ProvisionService['provisionToCodeEnv'];
  provisionToVectorDB: ProvisionService['provisionToVectorDB'];
  updateFile: (update: FileUpdate) => Promise<unknown>;
}

/**
 * Selects the tool context for a provisioning batch and reports which agent id it
 * belongs to. The batch id is preferred, then the primary agent, then the sole context
 * when only one exists, mirroring how the tool loaders resolve theirs.
 *
 */
function resolveProvisionContext({
  agentId,
  agentToolContexts,
  primaryAgentId,
}: {
  agentId?: string;
  agentToolContexts: Map<string, ProvisionToolContext>;
  primaryAgentId?: string;
}): { ctx?: ProvisionToolContext; resolvedAgentId?: string } {
  if (agentId != null && agentToolContexts.has(agentId)) {
    return { ctx: agentToolContexts.get(agentId), resolvedAgentId: agentId };
  }
  if (primaryAgentId != null && agentToolContexts.has(primaryAgentId)) {
    return { ctx: agentToolContexts.get(primaryAgentId), resolvedAgentId: primaryAgentId };
  }
  if (agentToolContexts.size === 1) {
    const sole = agentToolContexts.entries().next().value;
    if (sole) {
      const [key, ctx] = sole;
      return { ctx, resolvedAgentId: key };
    }
  }
  return {};
}

/**
 * Builds the ON_TOOL_EXECUTE provisioning callback. Shared by the chat path and the
 * OpenAI-compatible controllers so every surface provisions queued attachments before
 * the tool that needs them loads.
 */
export function createProvisionFilesCallback({
  req,
  agentToolContexts,
  resolvePrimaryAgentId,
  provisionToCodeEnv,
  provisionToVectorDB,
  updateFile,
}: ProvisionCallbackDeps): (toolNames: string[], agentId?: string) => Promise<void> {
  return async function provisionFiles(toolNames: string[], agentId?: string): Promise<void> {
    /* agentId is optional on this callback and a batch for the primary agent may omit
     * it, so fall back the way the tool loaders do. Otherwise the queue is missed and
     * the tool runs without its attachments. */
    /* Resolve the context and the id together. Scoping agent files by the raw argument
     * while reading state from a fallback context would upload them as user-scoped,
     * then reconstruct them as agent-scoped on the next turn, and the entity id used to
     * query those vectors would no longer match the one they were stored under. */
    const { ctx, resolvedAgentId } = resolveProvisionContext({
      agentId,
      agentToolContexts,
      primaryAgentId: resolvePrimaryAgentId?.(),
    });
    if (!ctx?.provisionState) {
      return;
    }

    const { provisionState } = ctx;
    /** Code execution expands into the sandbox file tools (+ their PTC variants);
     *  the legacy execute_code/run_tools_with_code names are kept for back-compat.
     *  edit_file and write_file read their target from the code environment, so a
     *  turn that starts with one of them must provision first. */
    const needsCode =
      toolNames.includes(Constants.EXECUTE_CODE) ||
      toolNames.includes(Constants.PROGRAMMATIC_TOOL_CALLING) ||
      toolNames.includes(Constants.BASH_TOOL) ||
      toolNames.includes(Constants.READ_FILE) ||
      toolNames.includes(Constants.EDIT_FILE) ||
      toolNames.includes(Constants.WRITE_FILE) ||
      toolNames.includes(CREATE_FILE_TOOL_NAME) ||
      toolNames.includes(Constants.BASH_PROGRAMMATIC_TOOL_CALLING);
    /** Programmatic tool calling orchestrates nested tools whose names never reach
     *  this predicate, so a file_search reachable only through PTC would otherwise
     *  run before its attachments were embedded. Provision when PTC is invoked. */
    const needsSearch =
      toolNames.includes('file_search') ||
      toolNames.includes(Constants.PROGRAMMATIC_TOOL_CALLING) ||
      toolNames.includes(Constants.BASH_PROGRAMMATIC_TOOL_CALLING);

    if (!needsCode && !needsSearch) {
      return;
    }

    /** Chat attachments and generated code outputs stay in the user's sandbox /
     *  unscoped vector index; only agent setup files are scoped to the agent. */
    const entityIdForFile = (file: TFile) =>
      isAgentScopedFile(file) ? resolvedAgentId : undefined;

    /** Surface a just-provisioned file to the tool loaded immediately after: the code
     *  and file_search primers read `tool_resources.<resource>.files`. */
    if (!ctx.tool_resources) {
      ctx.tool_resources = {};
    }
    const addProvisionedFile = (
      file: TFile,
      resourceType: EToolResources,
      agentScoped?: boolean,
    ) => {
      if (!file.file_id) {
        return;
      }
      const toolResources = ctx.tool_resources as Record<
        string,
        { files?: TFile[]; file_ids?: string[] } | undefined
      >;
      const resource = toolResources[resourceType] ?? {};
      /** Agent-scoped file_search files are embedded under `entity_id: agentId`, so
       *  they must be queried by `file_ids` (primeFiles marks those `fromAgent` and
       *  passes `entity_id`); user chat attachments and code files live in `files`. */
      if (agentScoped && resourceType === EToolResources.file_search) {
        const fileIds = resource.file_ids ? [...resource.file_ids] : [];
        if (!fileIds.includes(file.file_id)) {
          fileIds.push(file.file_id);
        }
        toolResources[resourceType] = { ...resource, file_ids: fileIds };
        return;
      }
      const files = resource.files ? [...resource.files] : [];
      if (!files.some((existing) => existing.file_id === file.file_id)) {
        files.push(file);
      }
      toolResources[resourceType] = { ...resource, files };
    };

    const pendingUpdates: FileUpdate[] = [];
    /** Code env updates tracked separately: primeCodeFiles reads the persisted record,
     *  so an unpersisted code ref makes the file invisible to the tool it was uploaded for. */
    const codeUpdateIds = new Set<string>();

    /** Files whose provisioning rejected this turn; kept queued so a transient
     *  outage can retry next turn instead of being silently dropped. */
    const failedCodeFiles: TFile[] = [];
    if (needsCode && provisionState.codeEnvFiles.length > 0) {
      const queuedCodeFiles = provisionState.codeEnvFiles;
      const results = await Promise.allSettled(
        queuedCodeFiles.map(async (file) => {
          const { referenceSet, fileUpdate } = await provisionToCodeEnv({
            req,
            file,
            entity_id: entityIdForFile(file),
          });
          file.metadata = { ...file.metadata, ...referenceSet };
          addProvisionedFile(file, EToolResources.execute_code);
          codeUpdateIds.add(fileUpdate.file_id);
          pendingUpdates.push(fileUpdate);
        }),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error('[provisionFiles] Code env provisioning failed', result.reason);
          failedCodeFiles.push(queuedCodeFiles[index]);
        }
      });
      provisionState.codeEnvFiles = failedCodeFiles;
    }

    if (needsSearch && provisionState.vectorDBFiles.length > 0) {
      const queuedVectorFiles = provisionState.vectorDBFiles;
      const results = await Promise.allSettled(
        queuedVectorFiles.map(async (file) => {
          const result = await provisionToVectorDB({
            req,
            file,
            entity_id: entityIdForFile(file),
          });
          if (result.embedded) {
            file.embedded = true;
            addProvisionedFile(
              file,
              EToolResources.file_search,
              entityIdForFile(file) !== undefined,
            );
            if (result.fileUpdate) {
              pendingUpdates.push(result.fileUpdate);
            }
          }
        }),
      );
      const failedVectorFiles: TFile[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error('[provisionFiles] Vector DB provisioning failed', result.reason);
          failedVectorFiles.push(queuedVectorFiles[index]);
        }
      });
      /* Unlike code, an unembedded file only narrows search results and is re-queued
       * next turn, so it does not abort the run. */
      provisionState.vectorDBFiles = failedVectorFiles;
    }

    if (pendingUpdates.length > 0) {
      const persist = async (updates: FileUpdate[]): Promise<FileUpdate[]> => {
        const results = await Promise.allSettled(
          updates.map((update: FileUpdate) => updateFile(update)),
        );
        return updates.filter(
          (_: FileUpdate, index: number) => results[index].status === 'rejected',
        );
      };

      /* One retry: a transient write failure otherwise leaves the record unprovisioned
       * while the queue is cleared. */
      let failed = await persist(pendingUpdates);
      if (failed.length > 0) {
        failed = await persist(failed);
      }

      for (const update of failed) {
        logger.error(`[provisionFiles] Failed to persist provisioning for file ${update.file_id}`);
      }

      /* primeCodeFiles re-reads the database and skips files without a persisted ref,
       * so continuing here would run code against an attachment the tool cannot see.
       * Fail the preflight instead of producing a silently incomplete result. */
      const unpersistedCodeFiles = failed.filter((update) => codeUpdateIds.has(update.file_id));
      if (unpersistedCodeFiles.length > 0) {
        throw new Error(
          `Failed to persist code environment references for ${unpersistedCodeFiles.length} file(s); aborting tool execution rather than running without them`,
        );
      }
    }

    /* Uploading to the code environment failed outright, so the sandbox does not have
     * the attachment; running the tool anyway would answer from missing input. */
    if (failedCodeFiles.length > 0) {
      throw new Error(
        `Failed to provision ${failedCodeFiles.length} file(s) to the code environment; aborting tool execution rather than running without them`,
      );
    }
  };
}
