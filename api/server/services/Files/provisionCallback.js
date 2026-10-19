const { createProvisionFilesCallback: createCallback } = require('@librechat/api');
const { provisionToCodeEnv, provisionToVectorDB } = require('~/server/services/Files/provision');
const db = require('~/models');
const { getSessionFileInfo } = require('~/server/services/Files/Code/process');

/* Wiring only: binds this workspace's provisioning service and file model to the
 * ON_TOOL_EXECUTE callback implemented in packages/api. */
function createProvisionFilesCallback({
  req,
  agentToolContexts,
  resolvePrimaryAgentId,
  resolveExecutionContext,
}) {
  return createCallback({
    req,
    agentToolContexts,
    resolvePrimaryAgentId,
    resolveExecutionContext,
    provisionToCodeEnv,
    provisionToVectorDB,
    updateFile: db.updateFile,
    updateCodeEnvRef: db.updateFileCodeEnvRef,
    addEmbeddedEntity: db.addFileEmbeddedEntity,
    getCodeFileInfo: (ref, route, signal) => getSessionFileInfo(ref, req, route, signal),
  });
}

module.exports = { createProvisionFilesCallback };
