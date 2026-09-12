import { dataService } from 'librechat-data-provider';

export const ONECODE_PROJECT_STORAGE_KEY = 'onecode.workspace';
export const ONECODE_RECENT_PROJECTS_STORAGE_KEY = 'onecode.recentWorkspaces';
export const ONECODE_MAX_RECENT_PROJECTS = 6;
export const ONECODE_ENDPOINT_NAME = 'OneCode';
export const ONECODE_WORKSPACE_CHANGED_EVENT = 'onecode:workspace-changed';

export type OneCodeProjectPickerResult = {
  workspace?: string;
  cancelled?: boolean;
  error?: string;
};

export type OneCodeFilesystemMCPSyncResult = {
  serverName: string;
  status: 'created' | 'updated';
};

export type OneCodeRunSummary = {
  run_id: string;
  status: string;
  reason?: string | null;
  delivery_status?: string;
  next_action?: string;
  ledger_path?: string;
  manifest_path?: string;
  checkpoint_count?: number;
};

export type OneCodeProjectStatus = {
  workspace: string;
  exists: boolean;
  allowed: boolean;
  allowed_roots?: string[];
  git?: { present: boolean };
  verifier_policy?: { present: boolean; path?: string };
  latest_run?: OneCodeRunSummary | null;
};

export type OneCodeStatusBadge = { kind: 'ok' | 'warn' | 'error'; label: string };

export type OneCodeVerifierPreset = {
  id: string;
  command: string[];
  cwd: string;
  timeout_ms: number;
};

export type OneCodeVerifierPolicy = {
  workspace: string;
  path: string;
  exists: boolean;
  valid: boolean;
  policy?: { verifiers: OneCodeVerifierPreset[] } | null;
  error?: string;
};

export type OneCodeDiagnostic = {
  status: string;
  checks: Array<{ name: string; passed: boolean; detail?: Record<string, unknown> }>;
  [key: string]: unknown;
};

export type OneCodeRunEvidence = {
  summary: OneCodeRunSummary;
  ledger: Record<string, unknown> | null;
  ledger_error?: string | null;
  manifest: Record<string, unknown> | null;
  manifest_error?: string | null;
  checkpoints: Array<{
    path?: string;
    record?: Record<string, unknown>;
    document?: Record<string, unknown> | null;
    error?: string | null;
  }>;
};

export type OneCodeModelConfig = {
  configured: boolean;
  provider?: string;
  endpoint?: string;
  model?: string;
  models: string[];
  api_key_preview?: string;
  source?: string;
  error?: string;
};

export type OneCodeModelConfigInput = {
  endpoint: string;
  apiKey: string;
  model?: string;
  models?: string[];
};

export type OneCodeModelsDiscoverInput = OneCodeModelConfigInput & {
  save?: boolean;
};

export function normalizeOneCodeWorkspace(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function normalizeOneCodeModelList(models: unknown): string[] {
  if (!Array.isArray(models)) {
    return [];
  }
  return models
    .map((item) => normalizeOneCodeWorkspace(typeof item === 'string' ? item : ''))
    .filter(Boolean);
}

export function normalizeOneCodeModelConfig(
  payload: Partial<OneCodeModelConfig>,
): OneCodeModelConfig {
  return {
    ...payload,
    configured: payload.configured === true,
    endpoint: normalizeOneCodeWorkspace(payload.endpoint),
    model: normalizeOneCodeWorkspace(payload.model),
    models: normalizeOneCodeModelList(payload.models),
  };
}

export function getWorkspaceBasename(workspace: string): string {
  const normalized = normalizeOneCodeWorkspace(workspace).replace(/\/+$/, '');
  if (!normalized) {
    return '未选择';
  }
  return normalized.split('/').pop() || normalized;
}

export function getStoredOneCodeWorkspace(storage: Storage = window.localStorage): string {
  return normalizeOneCodeWorkspace(storage.getItem(ONECODE_PROJECT_STORAGE_KEY));
}

export function getStoredOneCodeRecentProjects(storage: Storage = window.localStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(ONECODE_RECENT_PROJECTS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeOneCodeWorkspace(typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .slice(0, ONECODE_MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

export function rememberOneCodeWorkspace(workspace: string, recents: string[] = []): string[] {
  const normalized = normalizeOneCodeWorkspace(workspace);
  if (!normalized) {
    return recents.slice(0, ONECODE_MAX_RECENT_PROJECTS);
  }

  return [
    normalized,
    ...recents.filter((item) => normalizeOneCodeWorkspace(item) !== normalized),
  ].slice(0, ONECODE_MAX_RECENT_PROJECTS);
}

export function setStoredOneCodeWorkspace(
  workspace: string,
  storage: Storage = window.localStorage,
): string[] {
  const normalized = normalizeOneCodeWorkspace(workspace);
  if (!normalized) {
    storage.removeItem(ONECODE_PROJECT_STORAGE_KEY);
    notifyWorkspaceChange(storage);
    return getStoredOneCodeRecentProjects(storage);
  }

  const recents = rememberOneCodeWorkspace(normalized, getStoredOneCodeRecentProjects(storage));
  storage.setItem(ONECODE_PROJECT_STORAGE_KEY, normalized);
  storage.setItem(ONECODE_RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(recents));
  notifyWorkspaceChange(storage);
  return recents;
}

export function clearStoredOneCodeWorkspace(storage: Storage = window.localStorage): void {
  storage.removeItem(ONECODE_PROJECT_STORAGE_KEY);
  notifyWorkspaceChange(storage);
}

function notifyWorkspaceChange(storage: Storage): void {
  if (typeof window !== 'undefined' && storage === window.localStorage) {
    window.dispatchEvent(new Event(ONECODE_WORKSPACE_CHANGED_EVENT));
  }
}

export function buildOneCodeMetadata(workspace: string): { workspace: string } | undefined {
  const normalized = normalizeOneCodeWorkspace(workspace);
  return normalized ? { workspace: normalized } : undefined;
}

export function isOneCodeEndpoint(endpoint: string | null | undefined): boolean {
  return endpoint === ONECODE_ENDPOINT_NAME;
}

function normalizeProjectPickerResponse(
  payload: OneCodeProjectPickerResult,
): OneCodeProjectPickerResult {
  return {
    ...payload,
    workspace: normalizeOneCodeWorkspace(payload?.workspace),
  };
}

export async function pickOneCodeProjectFolder(
  picker: () => Promise<OneCodeProjectPickerResult> = dataService.pickOneCodeProjectFolder,
): Promise<OneCodeProjectPickerResult> {
  return normalizeProjectPickerResponse(await picker());
}

export async function createOneCodeProjectFolder(
  name: string,
  creator: (
    name: string,
  ) => Promise<OneCodeProjectPickerResult> = dataService.createOneCodeProjectFolder,
): Promise<OneCodeProjectPickerResult> {
  return normalizeProjectPickerResponse(await creator(name));
}

export async function syncOneCodeFilesystemMCP(
  workspace: string,
  syncer: (
    workspace: string,
  ) => Promise<OneCodeFilesystemMCPSyncResult> = dataService.syncOneCodeFilesystemMCP,
): Promise<OneCodeFilesystemMCPSyncResult | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  if (!normalized) {
    return undefined;
  }
  return syncer(normalized);
}

export function projectStatusBadges(
  status: Partial<OneCodeProjectStatus> | undefined,
): OneCodeStatusBadge[] {
  if (!status) {
    return [];
  }
  return [
    status.allowed ? { kind: 'ok', label: '已允许' } : { kind: 'error', label: '路径受限' },
    status.git?.present ? { kind: 'ok', label: 'Git' } : { kind: 'warn', label: '未初始化 Git' },
    status.verifier_policy?.present
      ? { kind: 'ok', label: '验证策略' }
      : { kind: 'warn', label: '缺少验证策略' },
  ];
}

export function latestRunActionLabel(run?: Partial<OneCodeRunSummary> | null): string {
  return run?.next_action === 'resume' ? '继续最新运行' : '查看最新运行';
}

export async function getOneCodeProjectStatus(
  workspace: string,
  getter: (
    workspace: string,
  ) => Promise<OneCodeProjectStatus> = dataService.getOneCodeProjectStatus,
): Promise<OneCodeProjectStatus | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  return normalized ? getter(normalized) : undefined;
}

export async function initOneCodeProject(
  workspace: string,
  initializer: (
    workspace: string,
  ) => Promise<OneCodeProjectStatus> = dataService.initOneCodeProject,
): Promise<OneCodeProjectStatus | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  return normalized ? initializer(normalized) : undefined;
}

export async function listOneCodeRuns(
  workspace: string,
  limit = 20,
  lister: (
    workspace: string,
    limit?: number,
  ) => Promise<{ runs: OneCodeRunSummary[] }> = dataService.listOneCodeRuns,
): Promise<OneCodeRunSummary[]> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  if (!normalized) {
    return [];
  }
  const payload = await lister(normalized, limit);
  return Array.isArray(payload.runs) ? payload.runs : [];
}

export async function inspectOneCodeRun(
  workspace: string,
  runId: string,
  inspector: (
    workspace: string,
    runId: string,
  ) => Promise<OneCodeRunSummary> = dataService.inspectOneCodeRun,
): Promise<OneCodeRunSummary | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  const normalizedRunId = normalizeOneCodeWorkspace(runId);
  return normalized && normalizedRunId ? inspector(normalized, normalizedRunId) : undefined;
}

export async function resumeOneCodeRun(
  workspace: string,
  runId: string,
  message?: string,
  resumer: (
    workspace: string,
    runId: string,
    message?: string,
  ) => Promise<Record<string, unknown>> = dataService.resumeOneCodeRun,
): Promise<Record<string, unknown> | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  const normalizedRunId = normalizeOneCodeWorkspace(runId);
  return normalized && normalizedRunId ? resumer(normalized, normalizedRunId, message) : undefined;
}

export async function getOneCodeVerifierPresets(
  getter: () => Promise<{
    presets: OneCodeVerifierPreset[];
  }> = dataService.getOneCodeVerifierPresets,
): Promise<OneCodeVerifierPreset[]> {
  const payload = await getter();
  return Array.isArray(payload.presets) ? payload.presets : [];
}

export async function getOneCodeVerifierPolicy(
  workspace: string,
  getter: (
    workspace: string,
  ) => Promise<OneCodeVerifierPolicy> = dataService.getOneCodeVerifierPolicy,
): Promise<OneCodeVerifierPolicy | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  return normalized ? getter(normalized) : undefined;
}

export async function writeOneCodeVerifierPolicy(
  workspace: string,
  presetIds?: string[],
  force?: boolean,
  writer: (
    workspace: string,
    presetIds?: string[],
    force?: boolean,
  ) => Promise<OneCodeVerifierPolicy> = dataService.writeOneCodeVerifierPolicy,
): Promise<OneCodeVerifierPolicy | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  return normalized ? writer(normalized, presetIds, force) : undefined;
}

export async function runOneCodeDoctor(
  runner: () => Promise<OneCodeDiagnostic> = dataService.runOneCodeDoctor,
): Promise<OneCodeDiagnostic> {
  return runner();
}

export async function runOneCodeSelfAudit(
  runner: () => Promise<OneCodeDiagnostic> = dataService.runOneCodeSelfAudit,
): Promise<OneCodeDiagnostic> {
  return runner();
}

export async function getOneCodeRunEvidence(
  workspace: string,
  runId: string,
  getter: (
    workspace: string,
    runId: string,
  ) => Promise<OneCodeRunEvidence> = dataService.getOneCodeRunEvidence,
): Promise<OneCodeRunEvidence | undefined> {
  const normalized = normalizeOneCodeWorkspace(workspace);
  const normalizedRunId = normalizeOneCodeWorkspace(runId);
  return normalized && normalizedRunId ? getter(normalized, normalizedRunId) : undefined;
}

export async function getOneCodeModelConfig(
  getter: () => Promise<Partial<OneCodeModelConfig>> = dataService.getOneCodeModelConfig,
): Promise<OneCodeModelConfig> {
  return normalizeOneCodeModelConfig(await getter());
}

export async function writeOneCodeModelConfig(
  input: OneCodeModelConfigInput,
  writer: (
    input: OneCodeModelConfigInput,
  ) => Promise<Partial<OneCodeModelConfig>> = dataService.writeOneCodeModelConfig,
): Promise<OneCodeModelConfig> {
  const payload = {
    endpoint: normalizeOneCodeWorkspace(input.endpoint),
    apiKey: normalizeOneCodeWorkspace(input.apiKey),
    model: normalizeOneCodeWorkspace(input.model),
    models: normalizeOneCodeModelList(input.models),
  };
  return normalizeOneCodeModelConfig(await writer(payload));
}

export async function discoverOneCodeModels(
  input: OneCodeModelsDiscoverInput,
  discoverer: (
    input: OneCodeModelsDiscoverInput,
  ) => Promise<OneCodeModelConfig> = dataService.discoverOneCodeModels,
): Promise<OneCodeModelConfig> {
  const payload = {
    endpoint: normalizeOneCodeWorkspace(input.endpoint),
    apiKey: normalizeOneCodeWorkspace(input.apiKey),
    model: normalizeOneCodeWorkspace(input.model),
    save: input.save === true,
  };
  return normalizeOneCodeModelConfig(await discoverer(payload));
}
