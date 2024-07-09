const crypto = require('crypto');
const { getMessages } = require('./Message');
const SharedLink = require('./schema/shareSchema');
const logger = require('~/config/winston');

module.exports = {
  SharedLink,
  getSharedMessages: async (shareId) => {
    try {
      const share = await SharedLink.findOne({ shareId })
        .populate({
          path: 'messages',
          select: '-_id -__v -user',
        })
        .select('-_id -__v -user')
        .lean();

      if (!share || !share.conversationId || !share.isPublic) {
        return null;
      }

      return share;
    } catch (error) {
      logger.error('[getShare] Error getting share link', error);
      throw new Error('Error getting share link');
    }
  },

  getSharedLinks: async (user, pageNumber = 1, pageSize = 25, isPublic = true) => {
    const query = { user, isPublic };
    try {
      const totalConvos = (await SharedLink.countDocuments(query)) || 1;
      const totalPages = Math.ceil(totalConvos / pageSize);
      const shares = await SharedLink.find(query)
        .sort({ updatedAt: -1 })
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize)
        .select('-_id -__v -user')
        .lean();

      return { sharedLinks: shares, pages: totalPages, pageNumber, pageSize };
    } catch (error) {
      logger.error('[getShareByPage] Error getting shares', error);
      throw new Error('Error getting shares');
    }
  },

  createSharedLink: async (user, { conversationId, ...shareData }) => {
    try {
      const share = await SharedLink.findOne({ conversationId }).select('-_id -__v -user').lean();
      if (share) {
        return share;
      }

      const shareId = crypto.randomUUID();
      const messages = await getMessages({ conversationId });
      const update = { ...shareData, shareId, messages, user };
      return await SharedLink.findOneAndUpdate({ conversationId: conversationId, user }, update, {
        new: true,
        upsert: true,
      });
    } catch (error) {
      logger.error('[createSharedLink] Error creating shared link', error);
      throw new Error('Error creating shared link');
    }
  },

  updateSharedLink: async (user, { conversationId, ...shareData }) => {
    try {
      const share = await SharedLink.findOne({ conversationId }).select('-_id -__v -user').lean();
      if (!share) {
        return { message: 'Share not found' };
      }

      // update messages to the latest
      const messages = await getMessages({ conversationId });
      const update = { ...shareData, messages, user };
      return await SharedLink.findOneAndUpdate({ conversationId: conversationId, user }, update, {
        new: true,
        upsert: false,
      });
    } catch (error) {
      logger.error('[updateSharedLink] Error updating shared link', error);
      throw new Error('Error updating shared link');
    }
  },

  deleteSharedLink: async (user, { shareId }) => {
    try {
      const share = await SharedLink.findOne({ shareId, user });
      if (!share) {
        return { message: 'Share not found' };
      }
      return await SharedLink.findOneAndDelete({ shareId, user });
    } catch (error) {
      logger.error('[deleteSharedLink] Error deleting shared link', error);
      throw new Error('Error deleting shared link');
    }
  },
  /**
   * Deletes all shared links for a specific user.
   * @param {string} user - The user ID.
   * @returns {Promise<{ message: string, deletedCount?: number }>} A result object indicating success or error message.
   */
  deleteAllSharedLinks: async (user) => {
    try {
      const result = await SharedLink.deleteMany({ user });
      return {
        message: 'All shared links have been deleted successfully',
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      logger.error('[deleteAllSharedLinks] Error deleting shared links', error);
      throw new Error('Error deleting shared links');
    }
  },
};
