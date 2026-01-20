export {
  CompactionManager,
  createCompactionManager,
  supportsCompaction,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
  type CompactionResult,
  type CompactionContext,
} from './CompactionManager';

export {
  CompactionService,
  createCompactionService,
  supportsCompaction as supportsCompactionModel,
  type CompactionServiceOptions,
  type CompactionResult as ServiceCompactionResult,
} from './CompactionService';
