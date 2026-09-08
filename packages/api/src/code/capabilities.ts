import { logger } from '@librechat/data-schemas';
import type { CodeEnvironmentConfig, CodeExecutionContext } from '~/agents/execution';
import { createCodeBridgeStatusPoller, readCodeBridgeSecret } from './bridge';

const pollWorkerStatus = createCodeBridgeStatusPoller();

/** Attached workers must confirm the stateful workspace needed by programmatic Bash. */
export async function supportsProgrammaticCodeExecution(
  context?: CodeExecutionContext,
  environments?: readonly CodeEnvironmentConfig[],
): Promise<boolean> {
  if (context?.environmentType !== 'attached') return true;
  if (!context.bridgeWorkerId) return false;
  const selected = environments?.find((environment) => environment.id === context.environmentId);
  const controlPlane = selected?.controlPlaneId
    ? environments?.find((environment) => environment.id === selected.controlPlaneId)
    : selected;
  const tokenEnv = controlPlane?.pairing?.tokenEnv;
  const token = tokenEnv == null ? undefined : readCodeBridgeSecret(tokenEnv)?.trim();
  if (
    !token ||
    !controlPlane ||
    controlPlane.type !== 'attached' ||
    controlPlane.owner === 'principal'
  )
    return false;
  if (controlPlane.baseURL.replace(/\/+$/, '') !== context.baseUrl.replace(/\/+$/, '')) {
    return false;
  }
  try {
    const status = await pollWorkerStatus({
      baseURL: context.baseUrl,
      workerId: context.bridgeWorkerId,
      token,
    });
    return status.status === 'ready' && status.statefulWorkspace === true;
  } catch {
    logger.warn('[codeCapabilities] Worker capabilities unavailable; programmatic Bash disabled');
    return false;
  }
}
