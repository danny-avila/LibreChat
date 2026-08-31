const { logger } = require('@librechat/data-schemas');
const { Constants } = require('@librechat/agents');
const { EToolResources } = require('librechat-data-provider');
const { isAgentScopedFile } = require('@librechat/api');
const { provisionToCodeEnv, provisionToVectorDB } = require('~/server/services/Files/provision');
const db = require('~/models');

/**
 * Builds the ON_TOOL_EXECUTE provisioning callback. Shared by the chat path and the
 * OpenAI-compatible controllers so every surface provisions queued attachments before
 * the tool that needs them loads.
 *
 * @param {object} params
 * @param {object} params.req - Authenticated request, used for storage and Code API auth
 * @param {Map<string, object>} params.agentToolContexts - Per-agent contexts holding provisionState
 * @returns {(toolNames: string[], agentId?: string) => Promise<void>}
 */
function createProvisionFilesCallback({ req, agentToolContexts }) {
  return async function provisionFiles(toolNames, agentId) {

  const ctx = agentToolContexts.get(agentId);
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
  const entityIdForFile = (file) => (isAgentScopedFile(file) ? agentId : undefined);

  /** Surface a just-provisioned file to the tool loaded immediately after: the code
   *  and file_search primers read `tool_resources.<resource>.files`. */
  if (!ctx.tool_resources) {
    ctx.tool_resources = {};
  }
  const addProvisionedFile = (file, resourceType, agentScoped) => {
    if (!file.file_id) {
      return;
    }
    const resource = ctx.tool_resources[resourceType] ?? {};
    /** Agent-scoped file_search files are embedded under `entity_id: agentId`, so
     *  they must be queried by `file_ids` (primeFiles marks those `fromAgent` and
     *  passes `entity_id`); user chat attachments and code files live in `files`. */
    if (agentScoped && resourceType === EToolResources.file_search) {
      const fileIds = resource.file_ids ? [...resource.file_ids] : [];
      if (!fileIds.includes(file.file_id)) {
        fileIds.push(file.file_id);
      }
      ctx.tool_resources[resourceType] = { ...resource, file_ids: fileIds };
      return;
    }
    const files = resource.files ? [...resource.files] : [];
    if (!files.some((existing) => existing.file_id === file.file_id)) {
      files.push(file);
    }
    ctx.tool_resources[resourceType] = { ...resource, files };
  };

  /** @type {import('@librechat/api').TFileUpdate[]} */
  const pendingUpdates = [];
  /** Code env updates tracked separately: primeCodeFiles reads the persisted record,
   *  so an unpersisted code ref makes the file invisible to the tool it was uploaded for. */
  const codeUpdateIds = new Set();

  /** Files whose provisioning rejected this turn; kept queued so a transient
   *  outage can retry next turn instead of being silently dropped. */
  const failedCodeFiles = [];
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
    const failedVectorFiles = [];
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
    const persist = async (updates) => {
      const results = await Promise.allSettled(updates.map((update) => db.updateFile(update)));
      return updates.filter((_, index) => results[index].status === 'rejected');
    };

    /* One retry: a transient write failure otherwise leaves the record unprovisioned
     * while the queue is cleared. */
    let failed = await persist(pendingUpdates);
    if (failed.length > 0) {
      failed = await persist(failed);
    }

    for (const update of failed) {
      logger.error(
        `[provisionFiles] Failed to persist provisioning for file ${update.file_id}`,
      );
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

module.exports = { createProvisionFilesCallback };
