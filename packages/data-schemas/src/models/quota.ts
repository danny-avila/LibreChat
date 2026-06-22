import quotaSchema from '~/schema/quota';
import type { IQuota } from '~/types/quota';

export function createQuotaModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Quota || mongoose.model<IQuota>('Quota', quotaSchema);
}
