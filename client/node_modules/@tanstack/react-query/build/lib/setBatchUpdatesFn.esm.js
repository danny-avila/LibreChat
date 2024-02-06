import { notifyManager } from '@tanstack/query-core';
import { unstable_batchedUpdates } from './reactBatchedUpdates.esm.js';

notifyManager.setBatchNotifyFunction(unstable_batchedUpdates);
//# sourceMappingURL=setBatchUpdatesFn.esm.js.map
