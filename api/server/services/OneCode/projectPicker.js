const childProcess = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { getMCPManager, getMCPServersRegistry } = require('~/config');

const execFile = promisify(childProcess.execFile);

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ONECODE_FILESYSTEM_MCP_SERVER = 'onecode-filesystem';

function isLocalRequest(req) {
  return LOCAL_ADDRESSES.has(req?.ip) || LOCAL_ADDRESSES.has(req?.socket?.remoteAddress);
}

function normalizePickedPath(stdout) {
  return String(stdout ?? '').trim();
}

function allowedWorkspaceRoots() {
  return String(
    process.env.ONECODE_ALLOWED_WORKSPACE_ROOTS || process.env.ONECODE_WORKSPACE_ROOT || '',
  )
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

function workspaceInsideAllowedRoots(workspace, roots = allowedWorkspaceRoots()) {
  const normalized = String(workspace ?? '').trim();
  if (!normalized) {
    return false;
  }
  if (roots.length === 0) {
    return true;
  }
  const resolved = path.resolve(normalized);
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
}

function requireAllowedWorkspace(workspace) {
  const normalized = String(workspace ?? '').trim();
  if (!normalized) {
    throw new Error('workspace is required');
  }
  const resolved = path.resolve(normalized);
  if (!workspaceInsideAllowedRoots(resolved)) {
    throw new Error(`workspace outside allowed roots: ${resolved}`);
  }
  return resolved;
}

function oneCodeApiUrl(pathname) {
  const base = (process.env.ONECODE_API_BASE_URL || 'http://localhost:19080/v1').replace(/\/$/, '');
  return `${base}${pathname}`;
}

async function oneCodeFetch(pathname, options = {}) {
  const response = await fetch(oneCodeApiUrl(pathname), {
    ...options,
    headers: {
      authorization: `Bearer ${process.env.ONECODE_API_TOKEN || 'dev-local-token'}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OneCode request failed: ${response.status}`);
  }
  return payload;
}

async function runMacFolderPicker(prompt) {
  if (process.platform !== 'darwin') {
    throw new Error('folder picker is only available on macOS local shell');
  }
  const script = [
    `set chosenFolder to choose folder with prompt "${prompt.replaceAll('"', '\\"')}"`,
    'POSIX path of chosenFolder',
  ].join('\n');
  const { stdout } = await execFile('osascript', ['-e', script], { timeout: 120000 });
  return normalizePickedPath(stdout);
}

async function pickOneCodeProjectFolder() {
  try {
    const workspace = await runMacFolderPicker('选择 OneCode 项目文件夹');
    return workspace ? { workspace } : { cancelled: true };
  } catch (error) {
    if (error?.code === 1) {
      return { cancelled: true };
    }
    throw error;
  }
}

function sanitizeProjectName(name) {
  const normalized = String(name ?? '').trim();
  if (!normalized) {
    throw new Error('project name is required');
  }
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('..')
  ) {
    throw new Error('invalid project name');
  }
  return normalized;
}

async function createOneCodeProject(name) {
  const projectName = sanitizeProjectName(name);
  const picked = await pickOneCodeProjectFolder();
  if (picked.cancelled) {
    return picked;
  }
  const parent = requireAllowedWorkspace(picked.workspace);
  const workspace = requireAllowedWorkspace(path.join(parent, projectName));
  await fs.mkdir(workspace, { recursive: false });
  return { workspace };
}

function filesystemMCPConfig(workspace) {
  const normalized = normalizePickedPath(workspace);
  if (!normalized) {
    throw new Error('workspace is required');
  }
  return {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', normalized],
    title: 'OneCode Filesystem',
    description: 'Filesystem tools scoped to the active OneCode project.',
    chatMenu: true,
    startup: false,
  };
}

async function syncOneCodeFilesystemMCP(workspace, userId, deps = {}) {
  const status = await getOneCodeProjectStatus(workspace);
  if (
    status?.allowed !== true ||
    status?.exists !== true ||
    typeof status.workspace !== 'string' ||
    !status.workspace.trim()
  ) {
    throw new Error('workspace could not be confirmed by OneCode');
  }

  const registry = deps.registry ?? getMCPServersRegistry();
  const manager = deps.manager ?? getMCPManager(userId);
  const config = filesystemMCPConfig(status.workspace);
  const existing = await registry.getServerConfig(ONECODE_FILESYSTEM_MCP_SERVER, userId);

  if (existing) {
    await registry.updateServer(ONECODE_FILESYSTEM_MCP_SERVER, config, 'CACHE', userId);
    await manager?.disconnectUserConnection?.(userId, ONECODE_FILESYSTEM_MCP_SERVER);
    return { serverName: ONECODE_FILESYSTEM_MCP_SERVER, status: 'updated' };
  }

  await registry.addServer(ONECODE_FILESYSTEM_MCP_SERVER, config, 'CACHE', userId);
  await manager?.disconnectUserConnection?.(userId, ONECODE_FILESYSTEM_MCP_SERVER);
  return { serverName: ONECODE_FILESYSTEM_MCP_SERVER, status: 'created' };
}

async function getOneCodeProjectStatus(workspace) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(`/onecode/project/status?workspace=${encodeURIComponent(resolved)}`);
}

async function initOneCodeProject(workspace) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch('/onecode/project/init', {
    method: 'POST',
    body: JSON.stringify({ workspace: resolved, git: true, verifierPolicy: true }),
  });
}

async function listOneCodeRuns(workspace, limit = 20) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(
    `/onecode/runs?workspace=${encodeURIComponent(resolved)}&limit=${encodeURIComponent(limit)}`,
  );
}

async function inspectOneCodeRun(workspace, runId) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(
    `/onecode/runs/${encodeURIComponent(runId)}/inspect?workspace=${encodeURIComponent(resolved)}`,
  );
}

async function resumeOneCodeRun(workspace, runId, message) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(`/onecode/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
    body: JSON.stringify({ workspace: resolved, message }),
  });
}

async function getOneCodeVerifierPresets() {
  return oneCodeFetch('/onecode/verifier/presets');
}

async function getOneCodeVerifierPolicy(workspace) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(`/onecode/verifier/policy?workspace=${encodeURIComponent(resolved)}`);
}

async function writeOneCodeVerifierPolicy(workspace, presetIds, force) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch('/onecode/verifier/policy', {
    method: 'POST',
    body: JSON.stringify({ workspace: resolved, presetIds, force: force === true }),
  });
}

async function runOneCodeDoctor() {
  return oneCodeFetch('/onecode/doctor', { method: 'POST' });
}

async function runOneCodeSelfAudit() {
  return oneCodeFetch('/onecode/audit-self', { method: 'POST' });
}

async function getOneCodeRunEvidence(workspace, runId) {
  const resolved = requireAllowedWorkspace(workspace);
  return oneCodeFetch(
    `/onecode/runs/${encodeURIComponent(runId)}/evidence?workspace=${encodeURIComponent(resolved)}`,
  );
}

function normalizeModelConfigPayload(payload = {}) {
  const endpoint = String(payload.endpoint || '').trim();
  const apiKey = String(payload.apiKey || payload.api_key || '').trim();
  const model = String(payload.model || '').trim();
  const models = Array.isArray(payload.models)
    ? payload.models.map((item) => String(item || '').trim()).filter(Boolean)
    : undefined;
  return { endpoint, apiKey, model, models };
}

async function getOneCodeModelConfig() {
  return oneCodeFetch('/onecode/model-config');
}

async function writeOneCodeModelConfig(payload = {}) {
  const config = normalizeModelConfigPayload(payload);
  return oneCodeFetch('/onecode/model-config', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: config.endpoint,
      api_key: config.apiKey,
      model: config.model,
      models: config.models,
    }),
  });
}

async function discoverOneCodeModels(payload = {}) {
  const config = normalizeModelConfigPayload(payload);
  return oneCodeFetch('/onecode/models/discover', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: config.endpoint,
      api_key: config.apiKey,
      model: config.model,
      save: payload.save === true,
    }),
  });
}

module.exports = {
  allowedWorkspaceRoots,
  createOneCodeProject,
  discoverOneCodeModels,
  filesystemMCPConfig,
  getOneCodeModelConfig,
  getOneCodeProjectStatus,
  getOneCodeRunEvidence,
  getOneCodeVerifierPolicy,
  getOneCodeVerifierPresets,
  initOneCodeProject,
  inspectOneCodeRun,
  isLocalRequest,
  listOneCodeRuns,
  oneCodeApiUrl,
  pickOneCodeProjectFolder,
  requireAllowedWorkspace,
  resumeOneCodeRun,
  runOneCodeDoctor,
  runOneCodeSelfAudit,
  sanitizeProjectName,
  syncOneCodeFilesystemMCP,
  writeOneCodeModelConfig,
  writeOneCodeVerifierPolicy,
  workspaceInsideAllowedRoots,
};
