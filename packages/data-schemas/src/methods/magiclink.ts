import type { Model, Types } from 'mongoose';
import type { IMagicLink, MagicLinkCreateData } from '~/types';

export function createMagicLinkMethods(mongoose: typeof import('mongoose')) {
  async function createMagicLink(data: MagicLinkCreateData): Promise<IMagicLink> {
    const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
    return await MagicLink.create(data);
  }

  async function findMagicLink(
    query: Partial<{ token: string; email: string; active: boolean; _id: Types.ObjectId | string }>,
  ): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
    return (await MagicLink.findOne(query).lean()) as IMagicLink | null;
  }

  async function findMagicLinkById(id: string): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
    return (await MagicLink.findById(id).lean()) as IMagicLink | null;
  }

  async function updateMagicLink(
    id: string,
    update: Partial<Pick<IMagicLink, 'active' | 'userId' | 'useCount' | 'lastUsedAt'>>,
  ): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
    return (await MagicLink.findByIdAndUpdate(id, update, { new: true }).lean()) as IMagicLink | null;
  }

  async function listMagicLinks(filter: {
    createdBy?: string | Types.ObjectId;
  }): Promise<IMagicLink[]> {
    const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
    return (await MagicLink.find(filter).lean()) as unknown as IMagicLink[];
  }

  return { createMagicLink, findMagicLink, findMagicLinkById, updateMagicLink, listMagicLinks };
}

export type MagicLinkMethods = ReturnType<typeof createMagicLinkMethods>;
