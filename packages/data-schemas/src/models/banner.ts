import bannerSchema from '~/schema/banner';
import type { IBanner } from '~/types';

/**
 * Creates or returns the Banner model using the provided mongoose instance and schema
 */
export function createBannerModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Banner || mongoose.model<IBanner>('Banner', bannerSchema);
}
