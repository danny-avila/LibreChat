import { logger } from '@librechat/data-schemas';
import type { CodeEnvironmentConfig, CodeExecutionContext } from '~/agents/execution';
import type { createAppConfigService } from '~/app/service';
import { createCodeBridgeStatusPoller, readCodeBridgeSecret } from './bridge';

export type CodeCapabilityConfigLoader = ReturnType<typeof createAppConfigService>['getAppConfig'];

const pollWorkerStatus = createCodeBridgeStatusPoller();

/** Attached workers must confirm both a stateful workspace and the Bash runtime. */
export async function supportsProgrammaticCodeExecution(
  context?: CodeExecutionContext,
  environments?: readonly CodeEnvironmentConfig[],
  getAppConfig?: CodeCapabilityConfigLoader,
): Promise<boolean> {
  if (context?.environmentType !== 'attached') return true;
  if (!context.bridgeWorkerId) return false;
  const selected = environments?.find((environment) => environment.id === context.environmentId);
  const controlPlaneId = selected?.controlPlaneId ?? selected?.id;
  const effectiveControlPlane = environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment',
  );
  if (!effectiveControlPlane || !getAppConfig) return false;
  try {
    const deploymentConfig = await getAppConfig({ baseOnly: true });
    const controlPlane =
      deploymentConfig.endpoints?.agents?.statefulCodeSessions?.environments?.find(
        (environment) =>
          environment.id === controlPlaneId &&
          environment.type === 'attached' &&
          environment.owner === 'deployment',
      );
    if (
      !controlPlane ||
      controlPlane.baseURL.replace(/\/+$/, '') !== context.baseUrl.replace(/\/+$/, '')
    ) {
      return false;
    }
    const tokenEnv = controlPlane.pairing?.tokenEnv;
    const token = tokenEnv == null ? undefined : readCodeBridgeSecret(tokenEnv)?.trim();
    if (!token) return false;
    const status = await pollWorkerStatus({
      baseURL: controlPlane.baseURL,
      workerId: context.bridgeWorkerId,
      token,
    });
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
