import { logger } from '@librechat/data-schemas';
import { ErrorTypes, isCodeWorkspaceSelections } from 'librechat-data-provider';
import type { CodeWorkspaceSelection } from 'librechat-data-provider';
import type { CodeEnvironmentConfig, CodeExecutionContext } from '~/agents/execution';
import type { createAppConfigService } from '~/app/service';
import type { CodeBridgeWorkerStatus } from './bridge';
import {
  CodeBridgeStatusError,
  createCodeBridgeStatusPoller,
  readCodeBridgeSecret,
} from './bridge';

export type CodeCapabilityConfigLoader = ReturnType<typeof createAppConfigService>['getAppConfig'];

const pollWorkerStatus = createCodeBridgeStatusPoller();

export type CodeWorkspaceSelectionErrorReason =
  | 'required'
  | 'invalid'
  | 'worker_unavailable'
  | 'unsupported'
  | 'missing';

function codeWorkspaceSelectionErrorMessage(reason: CodeWorkspaceSelectionErrorReason): string {
  switch (reason) {
    case 'required':
      return 'Choose an attached workspace before using this agent.';
    case 'invalid':
      return 'The selected attached workspace is invalid.';
    case 'worker_unavailable':
      return 'The attached code environment is unavailable. Reconnect the machine and try again.';
    case 'unsupported':
      return 'The attached code environment does not advertise selectable workspaces. Update the LibreChat Code worker and try again.';
    case 'missing':
      return 'The selected workspace is no longer registered on this machine. Choose another workspace explicitly or restore the previous registration.';
  }
}

export class CodeWorkspaceSelectionError extends Error {
  readonly code: ErrorTypes.CODE_WORKSPACE_UNAVAILABLE = ErrorTypes.CODE_WORKSPACE_UNAVAILABLE;
  readonly status: number = 409;
  readonly statusCode: number = 409;

  constructor(public readonly reason: CodeWorkspaceSelectionErrorReason) {
    super(codeWorkspaceSelectionErrorMessage(reason));
    this.name = 'CodeWorkspaceSelectionError';
  }
}

async function readAuthorizedAttachedWorkerStatus(
  context: CodeExecutionContext,
  environments: readonly CodeEnvironmentConfig[] | undefined,
  getAppConfig: CodeCapabilityConfigLoader | undefined,
): Promise<CodeBridgeWorkerStatus> {
  if (context.environmentType !== 'attached' || !context.bridgeWorkerId) {
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  const selected = environments?.find((environment) => environment.id === context.environmentId);
  const controlPlaneId = selected?.controlPlaneId ?? selected?.id;
  const effectiveControlPlane = environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment',
  );
  if (!effectiveControlPlane || !getAppConfig) {
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  const deploymentConfig = await getAppConfig({ baseOnly: true });
  const controlPlane = deploymentConfig.endpoints?.agents?.statefulCodeSessions?.environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment',
  );
  if (
    !controlPlane ||
    (selected?.workerId ?? selected?.pairing?.workerId) !== context.bridgeWorkerId ||
    (selected?.owner === 'deployment' &&
      controlPlane.pairing?.workerId !== context.bridgeWorkerId) ||
    controlPlane.baseURL.replace(/\/+$/, '') !== context.baseUrl.replace(/\/+$/, '')
  ) {
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  const tokenEnv = controlPlane.pairing?.tokenEnv;
  const token = tokenEnv == null ? undefined : readCodeBridgeSecret(tokenEnv)?.trim();
  if (!token) {
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  return await pollWorkerStatus({
    baseURL: controlPlane.baseURL,
    workerId: context.bridgeWorkerId,
    token,
  });
}

/**
 * Resolves a conversation preference into a live worker capability. Request
 * state wins so a user can deliberately change directories on this turn;
 * persisted state supplies reconnect and non-browser clients. Neither path is
 * trusted until the worker confirms the exact environment/workspace pair.
 */
export async function resolveCodeExecutionWorkspaceContext({
  context,
  requestedSelections,
  persistedSelections,
  environments,
  getAppConfig,
}: {
  context: CodeExecutionContext;
  requestedSelections?: unknown;
  persistedSelections?: unknown;
  environments?: readonly CodeEnvironmentConfig[];
  getAppConfig?: CodeCapabilityConfigLoader;
}): Promise<CodeExecutionContext> {
  if (context.environmentType !== 'attached') return context;
  const rawSelections =
    requestedSelections === undefined ? persistedSelections : requestedSelections;
  if (rawSelections == null) {
    throw new CodeWorkspaceSelectionError('required');
  }
  if (!isCodeWorkspaceSelections(rawSelections)) {
    throw new CodeWorkspaceSelectionError('invalid');
  }
  const selection: CodeWorkspaceSelection | undefined = rawSelections.find(
    ({ environmentId }) => environmentId === context.environmentId,
  );
  if (selection == null) throw new CodeWorkspaceSelectionError('required');

  let status: CodeBridgeWorkerStatus;
  try {
    status = await readAuthorizedAttachedWorkerStatus(context, environments, getAppConfig);
  } catch (error) {
    if (error instanceof CodeWorkspaceSelectionError) throw error;
    logger.warn(
      '[codeCapabilities] Worker workspace capabilities unavailable; workspace selection rejected',
      error instanceof CodeBridgeStatusError ? { reason: error.reason } : undefined,
    );
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  if (status.status !== 'ready' || status.statefulWorkspace !== true) {
    throw new CodeWorkspaceSelectionError('worker_unavailable');
  }
  if (!status.workspaces || !status.operations) {
    throw new CodeWorkspaceSelectionError('unsupported');
  }
  const workspace = status.workspaces.find(({ id }) => id === selection.workspaceId);
  if (!workspace) {
    throw new CodeWorkspaceSelectionError('missing');
  }
  return {
    ...context,
    codeWorkspace: {
      ...selection,
      operations: [...(workspace.operations ?? status.operations)],
    },
  };
}

/** Attached workers must confirm both a stateful workspace and the Bash runtime. */
export async function supportsProgrammaticCodeExecution(
  context?: CodeExecutionContext,
  environments?: readonly CodeEnvironmentConfig[],
  getAppConfig?: CodeCapabilityConfigLoader,
): Promise<boolean> {
  if (context?.environmentType !== 'attached') return true;
  /** Programmatic Bash uses Code API's generic exec endpoint, which has no
   * workspace identifier. A fully resolved attached context therefore cannot
   * use it until that protocol can preserve the selected-root boundary. */
  if (context.codeWorkspace != null) return false;
  try {
    const status = await readAuthorizedAttachedWorkerStatus(context, environments, getAppConfig);
    return (
      status.status === 'ready' &&
      status.statefulWorkspace === true &&
      status.runtimes?.includes('bash') === true
    );
  } catch {
    logger.warn('[codeCapabilities] Worker capabilities unavailable; programmatic Bash disabled');
    return false;
  }
}
