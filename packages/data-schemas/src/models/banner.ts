import mongoose from 'mongoose';
import bannerSchema from '~/schema/banner';
import type { IBanner } from '~/types';

export const Banner = mongoose.models.Banner || mongoose.model<IBanner>('Banner', bannerSchema);
