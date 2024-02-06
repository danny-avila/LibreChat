import { notifyManager } from '@tanstack/query-core';
import { unstable_batchedUpdates } from './reactBatchedUpdates.mjs';

notifyManager.setBatchNotifyFunction(unstable_batchedUpdates);
//# sourceMappingURL=setBatchUpdatesFn.mjs.map
