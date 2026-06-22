import usageLogSchema from '~/schema/usageLog';
import type { IUsageLog } from '~/types/usageLog';

export function createUsageLogModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.UsageLog || mongoose.model<IUsageLog>('UsageLog', usageLogSchema);
}
