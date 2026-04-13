import type { Model, Types } from 'mongoose';
import type { IMagicLink, MagicLinkCreateData } from '~/types';
import logger from '~/config/winston';

export function createMagicLinkMethods(mongoose: typeof import('mongoose')) {
  async function createMagicLink(data: MagicLinkCreateData): Promise<IMagicLink> {
    try {
      const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
      const doc = await MagicLink.create(data);
      return doc.toObject() as unknown as IMagicLink;
    } catch (error) {
      logger.error('[MagicLink.createMagicLink] Error:', error);
      throw error;
    }
  }

  async function findMagicLink(
    query: Partial<{ token: string; email: string; active: boolean; _id: Types.ObjectId | string }>,
  ): Promise<IMagicLink | null> {
    try {
      const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
      return (await MagicLink.findOne(query).lean()) as IMagicLink | null;
    } catch (error) {
      logger.error('[MagicLink.findMagicLink] Error:', error);
      throw error;
    }
  }

  async function findMagicLinkById(id: string): Promise<IMagicLink | null> {
    try {
      const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
      return (await MagicLink.findById(id).lean()) as IMagicLink | null;
    } catch (error) {
      logger.error('[MagicLink.findMagicLinkById] Error:', error);
      throw error;
    }
  }

  async function updateMagicLink(
    id: string,
    update: Partial<Pick<IMagicLink, 'active' | 'userId' | 'useCount' | 'lastUsedAt'>>,
  ): Promise<IMagicLink | null> {
    try {
      const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
      return (await MagicLink.findByIdAndUpdate(id, update, { new: true }).lean()) as IMagicLink | null;
    } catch (error) {
      logger.error('[MagicLink.updateMagicLink] Error:', error);
      throw error;
    }
  }

  async function listMagicLinks(filter: {
    createdBy?: string | Types.ObjectId;
  }): Promise<IMagicLink[]> {
    try {
      const MagicLink = mongoose.models.MagicLink as Model<IMagicLink>;
      return (await MagicLink.find(filter).lean()) as unknown as IMagicLink[];
    } catch (error) {
      logger.error('[MagicLink.listMagicLinks] Error:', error);
      throw error;
    }
  }

  return { createMagicLink, findMagicLink, findMagicLinkById, updateMagicLink, listMagicLinks };
}

export type MagicLinkMethods = ReturnType<typeof createMagicLinkMethods>;
