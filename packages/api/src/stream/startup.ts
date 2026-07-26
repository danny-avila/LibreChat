import { GenerationJobManager } from './GenerationJobManager';
import { createStreamServices } from './createStreamServices';
import { isEnabled } from '../utils/common';

/**
 * Configures and initializes the generation stream services, and reports whether the
 * resulting job store is SHARED across processes.
 *
 * Shared by BOTH entrypoints. This previously lived as a module-private const in
 * api/server/index.js, which could not be reused: that module invokes `startServer()`
 * at import time, so requiring it from the clustered entrypoint would boot a second
 * HTTP listener. The clustered workers therefore never configured the stream services
 * at all and silently ran on the unconfigured default (private in-memory) store even
 * with USE_REDIS_STREAMS set — making every worker's scheduler private, so cross-worker
 * aborts (delete/account-deletion quiescing) and orphan recovery could not work.
 *
 * It no longer registers an approval-expiry checkpoint prune. Expiry is TTL-driven now,
 * and that hook's thread-wide, generation-unfenced delete is exactly the race the
 * per-generation checkpoint capture replaced.
 *
 * @returns whether the job store is Redis-backed, i.e. genuinely shared between
 * processes. Callers in a clustered topology MUST fail closed when this is false
 * rather than assume sharing.
 */
export function configureGenerationStreams(): boolean {
  const streamServices = createStreamServices();
  GenerationJobManager.configure({
    ...streamServices,
    cleanupOnComplete: !isEnabled(process.env.STREAM_KEEP_COMPLETED_JOBS),
  });
  GenerationJobManager.initialize();
  // Read AFTER configure/initialize so this reflects the store actually in use,
  // including a Redis configuration that fell back to in-memory.
  return GenerationJobManager.isRedis;
}
