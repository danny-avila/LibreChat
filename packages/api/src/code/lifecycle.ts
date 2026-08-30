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
  const targets = environments
    .filter(
      (environment) => environment.workerPrincipal?.type === 'user' && environment.workerId != null,
    )
    .map((environment) => {
      const fallbackControlPlane = controlPlanes.find(
        (candidate) =>
          candidate.id === environment.controlPlaneId &&
          candidate.owner === 'deployment' &&
          candidate.type === 'attached' &&
          candidate.pairing?.allowPrincipalWorkers === true &&
          candidate.baseURL === environment.baseURL,
      );
      const tokenEnv = environment.revocationTokenEnv ?? fallbackControlPlane?.pairing?.tokenEnv;
      const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
      if (!token) {
        throw new Error(
          `Code environment revocation is unavailable for ${environment.environmentId}`,
        );
      }
      return { environment, token };
    });
  const results = await Promise.allSettled(
    targets.map(({ environment, token }) =>
      revokeCodeBridgeWorker({
        baseURL: environment.baseURL,
        token,
        workerId: environment.workerId,
        fetchImpl,
      }),
    ),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      'One or more code environment workers could not be revoked',
    );
  }
  return targets.length;
}
