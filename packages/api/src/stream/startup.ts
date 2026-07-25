import { tenantStorage } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import type { GetAppConfigOptions } from '../app/service';
import { deleteAgentCheckpoint } from '../agents/checkpointer';
import { GenerationJobManager } from './GenerationJobManager';
import { createStreamServices } from './createStreamServices';
import { isEnabled } from '../utils/common';

export interface GenerationStreamsDeps {
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig | undefined>;
}

/**
 * Configures and initializes the generation stream services plus the approval-expiry
 * handler, and reports whether the resulting job store is SHARED across processes.
 *
 * Shared by BOTH entrypoints. This previously lived as a module-private const in
 * api/server/index.js, which could not be reused: that module invokes `startServer()`
 * at import time, so requiring it from the clustered entrypoint would boot a second
 * HTTP listener. The clustered workers therefore never configured the stream services
 * at all and silently ran on the unconfigured default (private in-memory) store even
 * with USE_REDIS_STREAMS set — making every worker's scheduler private, so cross-worker
 * aborts (delete/account-deletion quiescing) and orphan recovery could not work.
 *
 * @returns whether the job store is Redis-backed, i.e. genuinely shared between
 * processes. Callers in a clustered topology MUST fail closed when this is false
 * rather than assume sharing.
 */
export function configureGenerationStreams(deps: GenerationStreamsDeps): boolean {
  const streamServices = createStreamServices();
  GenerationJobManager.configure({
    ...streamServices,
    cleanupOnComplete: !isEnabled(process.env.STREAM_KEEP_COMPLETED_JOBS),
  });
  GenerationJobManager.initialize();
  // Prune the paused run's durable checkpoint when its approval EXPIRES instead of
  // leaving it until the Mongo TTL. Resolved in the PAUSED JOB's tenant/user scope:
  // expiry runs outside any request context, and getAppConfig args only key the cache,
  // so the tenant context must be entered explicitly.
  GenerationJobManager.setApprovalExpiredHandler(async (conversationId, job) => {
    await tenantStorage.run({ tenantId: job?.tenantId, userId: job?.userId }, async () => {
      const appConfig = await deps.getAppConfig({
        userId: job?.userId,
        tenantId: job?.tenantId,
      });
      await deleteAgentCheckpoint(conversationId, appConfig?.endpoints?.agents?.checkpointer);
    });
  });
  // Read AFTER configure/initialize so this reflects the store actually in use,
  // including a Redis configuration that fell back to in-memory.
  return GenerationJobManager.isRedis;
}
