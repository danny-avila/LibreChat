import { createMethods } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { CodeBridgeFetch } from './bridge';
import { readCodeBridgeSecret, revokeCodeBridgeWorker } from './bridge';

export async function revokeUserCodeEnvironmentWorkers({
  mongoose,
  userId,
  appConfig,
  readSecret = readCodeBridgeSecret,
  fetchImpl,
}: {
  mongoose: typeof import('mongoose');
  userId: string;
  appConfig: AppConfig;
  readSecret?: (name: string) => string | undefined;
  fetchImpl?: CodeBridgeFetch;
}): Promise<number> {
  const environments = await createMethods(mongoose).findCodeEnvironmentsByCreator(userId);
  const controlPlanes =
    appConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions?.environments ?? [];
  let revoked = 0;
  for (const environment of environments) {
    if (environment.workerPrincipal?.type !== 'user' || environment.workerId == null) continue;
    const controlPlane = controlPlanes.find(
      (candidate) =>
        candidate.id === environment.controlPlaneId &&
        candidate.owner === 'deployment' &&
        candidate.type === 'attached' &&
        candidate.pairing?.allowPrincipalWorkers === true &&
        candidate.baseURL === environment.baseURL,
    );
    if (controlPlane == null) {
      throw new Error(
        `Code environment control plane is unavailable for ${environment.environmentId}`,
      );
    }
    const tokenEnv = controlPlane.pairing?.tokenEnv;
    const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
    if (!token) {
      throw new Error(
        `Code environment revocation is unavailable for ${environment.environmentId}`,
      );
    }
    await revokeCodeBridgeWorker({
      baseURL: controlPlane.baseURL,
      token,
      workerId: environment.workerId,
      fetchImpl,
    });
    revoked += 1;
  }
  return revoked;
}
