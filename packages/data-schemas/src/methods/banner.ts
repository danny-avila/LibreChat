import { randomUUID } from 'crypto';
import type { Model, Types } from 'mongoose';
import logger from '~/config/winston';
import type { IBanner, IUser } from '~/types';

export interface BannerListOptions {
  limit?: number;
  offset?: number;
}

export type BannerCreateInput = Partial<
  Pick<
    IBanner,
    'bannerId' | 'message' | 'displayFrom' | 'displayTo' | 'type' | 'isPublic' | 'persistable'
  >
>;

export type BannerUpdateInput = Partial<
  Pick<IBanner, 'message' | 'displayFrom' | 'displayTo' | 'type' | 'isPublic' | 'persistable'>
>;

export function createBannerMethods(mongoose: typeof import('mongoose')) {
  /**
   * Retrieves the current active banner.
   */
  async function getBanner(user?: IUser | null): Promise<IBanner | null> {
    try {
      const Banner = mongoose.models.Banner as Model<IBanner>;
      const now = new Date();
      const banner = (await Banner.findOne({
        displayFrom: { $lte: now },
        $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
        type: 'banner',
      }).lean()) as IBanner | null;

      if (!banner || banner.isPublic || user != null) {
        return banner;
      }

      return null;
    } catch (error) {
      logger.error('[getBanners] Error getting banners', error);
      throw new Error('Error getting banners');
    }
  }

  /** List banners ordered by most recent first. */
  async function listBanners(options: BannerListOptions = {}): Promise<IBanner[]> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    const query = Banner.find().sort({ createdAt: -1 });
    if (typeof options.offset === 'number' && options.offset > 0) {
      query.skip(options.offset);
    }
    if (typeof options.limit === 'number' && options.limit > 0) {
      query.limit(options.limit);
    }
    return (await query.lean()) as IBanner[];
  }

  async function countBanners(): Promise<number> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    return await Banner.countDocuments();
  }

  async function findBannerById(id: string | Types.ObjectId): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    return (await Banner.findById(id).lean()) as IBanner | null;
  }

  async function createBanner(data: BannerCreateInput): Promise<IBanner> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    const created = await Banner.create({
      ...data,
      bannerId: data.bannerId ?? randomUUID(),
    });
    return created.toObject() as IBanner;
  }

  async function updateBannerById(
    id: string | Types.ObjectId,
    data: BannerUpdateInput,
  ): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    return (await Banner.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    ).lean()) as IBanner | null;
  }

  async function deleteBannerById(id: string | Types.ObjectId): Promise<IBanner | null> {
    const Banner = mongoose.models.Banner as Model<IBanner>;
    return (await Banner.findByIdAndDelete(id).lean()) as IBanner | null;
  }

  return {
    getBanner,
    listBanners,
    countBanners,
    findBannerById,
    createBanner,
    updateBannerById,
    deleteBannerById,
  };
}

export type BannerMethods = ReturnType<typeof createBannerMethods>;
