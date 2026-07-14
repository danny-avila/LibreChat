export {
  GenerationJobManager,
  GenerationJobManagerClass,
  type GenerationJobManagerOptions,
} from './GenerationJobManager';

export type {
  SerializableJobData,
  SteerQueueItem,
  IEventTransport,
  UsageMetadata,
  AbortResult,
  JobStatus,
  IJobStore,
} from './interfaces/IJobStore';
// Canonical "is this approval live?" predicate — one definition shared by the
// stores, the approval lifecycle, and the status route / message middleware.
export { isPendingActionExpired, isPendingActionStale } from './interfaces/IJobStore';
export {
  STEER_ENQUEUE_NOT_RUNNING,
  STEER_ENQUEUE_QUEUE_FULL,
  STEER_QUEUE_MAX_DEPTH,
} from './interfaces/IJobStore';
export { SteeringLifecycle, toPendingSteer } from './SteeringLifecycle';

export { createStreamServices } from './createStreamServices';
export type { StreamServicesConfig, StreamServices } from './createStreamServices';
export { filterPersistableAbortContent, hasPersistableAbortContent } from './abortContent';

// Implementations (for advanced use cases)
export { InMemoryJobStore } from './implementations/InMemoryJobStore';
export { InMemoryEventTransport } from './implementations/InMemoryEventTransport';
export { RedisJobStore } from './implementations/RedisJobStore';
export { RedisEventTransport } from './implementations/RedisEventTransport';
