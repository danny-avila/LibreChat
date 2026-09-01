import { EModelEndpoint, ResourceType } from 'librechat-data-provider';
import { createMethods, logger, runAsSystem } from '@librechat/data-schemas';
import type { AppConfig, CodeEnvironmentDocument } from '@librechat/data-schemas';
import type { CodeBridgeFetch } from './bridge';
import { readCodeBridgeSecret, revokeCodeBridgeWorker } from './bridge';

const RECONCILE_INTERVAL_MS = 60_000;
const RECONCILE_LEASE_MS = 2 * 60_000;
const REGISTRATION_STALE_MS = 5 * 60_000;
const REGISTRATION_RETRY_MS = 5 * 60_000;
const REVOCATION_RETRY_MS = 5 * 60_000;
let reconcileTimer: NodeJS.Timeout | undefined;
let reconcileInFlight: Promise<void> | undefined;

export async function reconcileCodeEnvironmentLifecycle({
  mongoose,
  readSecret = readCodeBridgeSecret,
  fetchImpl,
  limit = 25,
}: {
  mongoose: typeof import('mongoose');
  readSecret?: (name: string) => string | undefined;
  fetchImpl?: CodeBridgeFetch;
  limit?: number;
}): Promise<void> {
  await runAsSystem(async () => {
    const CodeEnvironment = mongoose.models.CodeEnvironment;
    const AclEntry = mongoose.models.AclEntry;
    if (CodeEnvironment == null || AclEntry == null) return;
    const methods = createMethods(mongoose);
    const now = new Date();
    await CodeEnvironment.updateMany(
      {},
      { $pull: { pendingAgentReferences: { expiresAt: { $lte: now } } } },
    );
    const expiredRemovals = await CodeEnvironment.find({
      deletionCommittedAt: { $exists: false },
      deletionLeaseExpiresAt: { $lte: now },
    })
      .sort({ _id: 1 })
      .limit(limit)
      .select('_id')
      .lean<Array<Pick<CodeEnvironmentDocument, '_id'>>>();
    for (const candidate of expiredRemovals) {
      const environment = await methods.beginCodeEnvironmentRemoval(candidate._id);
      if (environment == null || environment.deletionLeaseId == null) continue;
      const leaseId = environment.deletionLeaseId;
      const Agent = mongoose.models.Agent;
      if (
        Agent != null &&
        (await Agent.exists({ code_environment_id: environment.environmentId })) != null
      ) {
        await methods.cancelCodeEnvironmentRemoval(environment._id, leaseId);
        continue;
      }
      try {
        if (environment.workerPrincipal?.type === 'user') {
          const tokenEnv = environment.revocationTokenEnv;
          const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
          if (!token || environment.workerId == null) continue;
          await revokeCodeBridgeWorker({
            baseURL: environment.baseURL,
            token,
            workerId: environment.workerId,
            fetchImpl,
          });
        }
        await methods.commitCodeEnvironmentRemoval(environment._id, leaseId);
        await AclEntry.deleteMany({
          resourceType: ResourceType.CODE_ENVIRONMENT,
          resourceId: environment._id,
        });
        await methods.deleteCodeEnvironmentById(environment._id);
      } catch (error) {
        logger.error('[code-environments] interrupted removal reconciliation failed:', error);
      }
    }
    const staleRegistration = new Date(Date.now() - REGISTRATION_STALE_MS);
    const registrationCandidates = await CodeEnvironment.find({
      registrationPendingAt: { $lte: staleRegistration },
      $and: [
        {
          $or: [
            { registrationReconcileAfter: { $exists: false } },
            { registrationReconcileAfter: { $lte: now } },
          ],
        },
        {
          $or: [
            { registrationLeaseExpiresAt: { $exists: false } },
            { registrationLeaseExpiresAt: { $lte: now } },
          ],
        },
      ],
    })
      .sort({ registrationReconcileAfter: 1, _id: 1 })
      .limit(limit)
      .select('_id')
      .lean<Array<Pick<CodeEnvironmentDocument, '_id'>>>();
    for (const candidate of registrationCandidates) {
      const leaseId = new mongoose.Types.ObjectId().toHexString();
      const leaseNow = new Date();
      const environment = await CodeEnvironment.findOneAndUpdate(
        {
          _id: candidate._id,
          registrationPendingAt: { $lte: staleRegistration },
          $and: [
            {
              $or: [
                { registrationReconcileAfter: { $exists: false } },
                { registrationReconcileAfter: { $lte: leaseNow } },
              ],
            },
            {
              $or: [
                { registrationLeaseExpiresAt: { $exists: false } },
                { registrationLeaseExpiresAt: { $lte: leaseNow } },
              ],
            },
          ],
        },
        {
          $set: {
            registrationLeaseId: leaseId,
            registrationLeaseExpiresAt: new Date(leaseNow.getTime() + RECONCILE_LEASE_MS),
          },
        },
        { new: true },
      ).lean<CodeEnvironmentDocument>();
      if (environment == null) continue;
      const deferRegistration = async (): Promise<void> => {
        await CodeEnvironment.updateOne(
          { _id: environment._id, registrationLeaseId: leaseId },
          {
            $set: { registrationReconcileAfter: new Date(Date.now() + REGISTRATION_RETRY_MS) },
            $unset: { registrationLeaseId: 1, registrationLeaseExpiresAt: 1 },
          },
        );
      };
      const tokenEnv = environment.revocationTokenEnv;
      const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
      if (environment.workerId != null) {
        if (!token) {
          await deferRegistration();
          continue;
        }
        try {
          await revokeCodeBridgeWorker({
            baseURL: environment.baseURL,
            token,
            workerId: environment.workerId,
            fetchImpl,
          });
        } catch {
          await deferRegistration();
          continue;
        }
      }
      await AclEntry.deleteMany({
        resourceType: ResourceType.CODE_ENVIRONMENT,
        resourceId: environment._id,
      });
      await CodeEnvironment.deleteOne({
        _id: environment._id,
        registrationLeaseId: leaseId,
      });
    }

    const committedDeletions = await CodeEnvironment.find({
      deletionCommittedAt: { $exists: true },
    })
      .limit(limit)
      .lean<CodeEnvironmentDocument[]>();
    for (const environment of committedDeletions) {
      await AclEntry.deleteMany({
        resourceType: ResourceType.CODE_ENVIRONMENT,
        resourceId: environment._id,
      });
      await methods.deleteCodeEnvironmentById(environment._id);
    }

    const candidates = await CodeEnvironment.find({
      revocationPendingAt: { $exists: true },
      $and: [
        {
          $or: [
            { revocationReconcileAfter: { $exists: false } },
            { revocationReconcileAfter: { $lte: now } },
          ],
        },
        {
          $or: [
            { revocationLeaseExpiresAt: { $exists: false } },
            { revocationLeaseExpiresAt: { $lte: now } },
          ],
        },
      ],
    })
      .sort({ revocationReconcileAfter: 1, _id: 1 })
      .limit(limit)
      .select('_id')
      .lean<Array<Pick<CodeEnvironmentDocument, '_id'>>>();
    for (const candidate of candidates) {
      const now = new Date();
      const leaseId = new mongoose.Types.ObjectId().toHexString();
      const environment = await CodeEnvironment.findOneAndUpdate(
        {
          _id: candidate._id,
          revocationPendingAt: { $exists: true },
          $and: [
            {
              $or: [
                { revocationReconcileAfter: { $exists: false } },
                { revocationReconcileAfter: { $lte: now } },
              ],
            },
            {
              $or: [
                { revocationLeaseExpiresAt: { $exists: false } },
                { revocationLeaseExpiresAt: { $lte: now } },
              ],
            },
          ],
        },
        {
          $set: {
            revocationLeaseId: leaseId,
            revocationLeaseExpiresAt: new Date(now.getTime() + RECONCILE_LEASE_MS),
          },
          $inc: { revocationAttempts: 1 },
        },
        { new: true },
      ).lean<CodeEnvironmentDocument>();
      if (environment == null || environment.workerId == null) continue;
      const tokenEnv = environment.revocationTokenEnv;
      const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
      try {
        if (!token) throw new Error('Code environment revocation token is unavailable');
        await revokeCodeBridgeWorker({
          baseURL: environment.baseURL,
          token,
          workerId: environment.workerId,
          fetchImpl,
        });
        await AclEntry.deleteMany({
          resourceType: ResourceType.CODE_ENVIRONMENT,
          resourceId: environment._id,
        });
        await methods.deleteCodeEnvironmentById(environment._id);
      } catch (error) {
        const message = (error instanceof Error ? error.message : 'Worker revocation failed').slice(
          0,
          500,
        );
        await CodeEnvironment.updateOne(
          { _id: environment._id, revocationLeaseId: leaseId },
          {
            $set: {
              revocationLastError: message,
              revocationReconcileAfter: new Date(Date.now() + REVOCATION_RETRY_MS),
            },
            $unset: { revocationLeaseId: 1, revocationLeaseExpiresAt: 1 },
          },
        );
      }
    }
  });
}

export function startCodeEnvironmentLifecycleReconciler(
  options: Parameters<typeof reconcileCodeEnvironmentLifecycle>[0],
): void {
  if (reconcileTimer != null) return;
  const run = (): void => {
    if (reconcileInFlight != null) return;
    const current = reconcileCodeEnvironmentLifecycle(options)
      .catch((error) => {
        logger.error('[code-environments] lifecycle reconciliation failed:', error);
      })
      .finally(() => {
        if (reconcileInFlight === current) reconcileInFlight = undefined;
      });
    reconcileInFlight = current;
  };
  run();
  reconcileTimer = setInterval(run, RECONCILE_INTERVAL_MS);
  reconcileTimer.unref();
}

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
          $set: { deletionCommittedAt: new Date() },
          $unset: {
            revocationPendingAt: 1,
            revocationAttempts: 1,
            revocationLastError: 1,
            revocationReconcileAfter: 1,
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
