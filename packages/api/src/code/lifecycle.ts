import { EModelEndpoint } from 'librechat-data-provider';
import { createMethods, logger } from '@librechat/data-schemas';
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
  const targets = environments.filter(
    (environment) => environment.workerPrincipal?.type === 'user' && environment.workerId != null,
  );
  const CodeEnvironment = mongoose.models.CodeEnvironment;
  if (targets.length > 0 && CodeEnvironment != null) {
    await CodeEnvironment.updateMany(
      { _id: { $in: targets.map(({ _id }) => _id) } },
      {
        $set: { revocationPendingAt: new Date() },
        $inc: { revocationAttempts: 1 },
        $unset: { revocationLastError: 1 },
      },
    );
  }
  const results = await Promise.allSettled(
    targets.map(async (environment) => {
      const workerId = environment.workerId;
      if (workerId == null) {
        throw new Error(
          `Code environment worker id is unavailable for ${environment.environmentId}`,
        );
      }
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
      await revokeCodeBridgeWorker({
        baseURL: environment.baseURL,
        token,
        workerId,
        fetchImpl,
      });
      return environment.environmentId;
    }),
  );
  let revoked = 0;
  for (const [index, result] of results.entries()) {
    const target = targets[index];
    if (result.status === 'fulfilled') {
      revoked += 1;
      await CodeEnvironment?.updateOne(
        { _id: target._id },
        {
          $unset: {
            revocationPendingAt: 1,
            revocationAttempts: 1,
            revocationLastError: 1,
          },
        },
      );
      continue;
    }
    const failureMessage = (
      result.reason instanceof Error ? result.reason.message : 'Worker revocation failed'
    ).slice(0, 500);
    await CodeEnvironment?.updateOne(
      { _id: target._id },
      { $set: { revocationLastError: failureMessage } },
    );
    logger.error(
      `[code-environments] worker revocation failed during committed user deletion: ${userId}`,
      result.reason,
    );
  }
  return revoked;
}
