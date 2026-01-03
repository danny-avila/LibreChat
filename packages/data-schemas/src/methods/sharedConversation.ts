import type { Model } from 'mongoose';
import type * as t from '~/types';
import logger from '~/config/winston';

class SharedConversationError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SharedConversationError';
    this.code = code;
  }
}

/** Factory function that takes mongoose instance and returns the methods */
export function createSharedConversationMethods(mongoose: typeof import('mongoose')) {
  /**
   * Share a conversation with specific users
   */
  async function shareConversationWithUsers(
    ownerId: string,
    conversationId: string,
    userIds: string[],
    ownerInfo?: { name?: string; email?: string },
  ): Promise<t.ShareWithUsersResult> {
    if (!ownerId || !conversationId || !userIds || userIds.length === 0) {
      throw new SharedConversationError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;
      const Conversation = mongoose.models.Conversation;

      // Verify the conversation belongs to the owner
      const conversation = await Conversation.findOne({ conversationId, user: ownerId }).lean();
      if (!conversation) {
        throw new SharedConversationError(
          'Conversation not found or access denied',
          'CONVERSATION_NOT_FOUND',
        );
      }

      const title = (conversation as { title?: string }).title || 'Untitled';

      // Create share entries for each user (skip if already shared)
      const sharePromises = userIds.map(async (userId) => {
        // Don't allow sharing with yourself
        if (userId === ownerId) {
          return null;
        }

        try {
          await SharedConversation.findOneAndUpdate(
            { conversationId, sharedWithUserId: userId },
            {
              conversationId,
              ownerId,
              ownerName: ownerInfo?.name,
              ownerEmail: ownerInfo?.email,
              sharedWithUserId: userId,
              title,
            },
            { upsert: true, new: true },
          );
          return userId;
        } catch (error) {
          // Handle duplicate key errors silently (already shared)
          if ((error as { code?: number }).code === 11000) {
            return userId;
          }
          throw error;
        }
      });

      const results = await Promise.all(sharePromises);
      const sharedWith = results.filter((id): id is string => id !== null);

      return {
        success: true,
        sharedWith,
        message: `Conversation shared with ${sharedWith.length} user(s)`,
      };
    } catch (error) {
      if (error instanceof SharedConversationError) {
        throw error;
      }
      logger.error('[shareConversationWithUsers] Error sharing conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ownerId,
        conversationId,
      });
      throw new SharedConversationError('Error sharing conversation', 'SHARE_ERROR');
    }
  }

  /**
   * Revoke sharing access for specific users
   */
  async function revokeConversationShare(
    ownerId: string,
    conversationId: string,
    userIds: string[],
  ): Promise<t.RevokeShareResult> {
    if (!ownerId || !conversationId || !userIds || userIds.length === 0) {
      throw new SharedConversationError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;

      // Verify the conversation belongs to the owner
      const Conversation = mongoose.models.Conversation;
      const conversation = await Conversation.findOne({ conversationId, user: ownerId }).lean();
      if (!conversation) {
        throw new SharedConversationError(
          'Conversation not found or access denied',
          'CONVERSATION_NOT_FOUND',
        );
      }

      await SharedConversation.deleteMany({
        conversationId,
        ownerId,
        sharedWithUserId: { $in: userIds },
      });

      return {
        success: true,
        message: `Revoked sharing access for ${userIds.length} user(s)`,
      };
    } catch (error) {
      if (error instanceof SharedConversationError) {
        throw error;
      }
      logger.error('[revokeConversationShare] Error revoking share', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ownerId,
        conversationId,
      });
      throw new SharedConversationError('Error revoking share access', 'REVOKE_ERROR');
    }
  }

  /**
   * Get all users a conversation is shared with
   */
  async function getConversationShares(
    ownerId: string,
    conversationId: string,
  ): Promise<t.GetConversationSharesResult> {
    if (!ownerId || !conversationId) {
      throw new SharedConversationError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;
      const User = mongoose.models.User;

      const shares = await SharedConversation.find({ conversationId, ownerId })
        .select('sharedWithUserId')
        .lean();

      if (shares.length === 0) {
        return { conversationId, sharedWith: [] };
      }

      const userIds = shares.map((share) => share.sharedWithUserId);
      const users = await User.find({ _id: { $in: userIds } })
        .select('_id name email')
        .lean();

      const sharedWith: t.SharedConversationUser[] = users.map(
        (user: { _id: { toString(): string }; name?: string; email?: string }) => ({
          id: user._id.toString(),
          name: user.name,
          email: user.email,
        }),
      );

      return { conversationId, sharedWith };
    } catch (error) {
      logger.error('[getConversationShares] Error getting shares', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ownerId,
        conversationId,
      });
      throw new SharedConversationError('Error getting conversation shares', 'FETCH_ERROR');
    }
  }

  /**
   * Get all conversations shared with a specific user
   */
  async function getSharedConversations(
    userId: string,
    pageParam?: Date,
    pageSize: number = 25,
  ): Promise<t.SharedConversationResult> {
    if (!userId) {
      throw new SharedConversationError('Missing required parameters', 'INVALID_PARAMS');
    }

    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;
      const Conversation = mongoose.models.Conversation;

      const query: Record<string, unknown> = { sharedWithUserId: userId };
      if (pageParam) {
        query.updatedAt = { $lt: pageParam };
      }

      const shares = await SharedConversation.find(query)
        .sort({ updatedAt: -1 })
        .limit(pageSize + 1)
        .lean();

      const hasNextPage = shares.length > pageSize;
      const results = shares.slice(0, pageSize);

      // Get conversation details for each share
      const conversationIds = results.map((s) => s.conversationId);
      const conversations = await Conversation.find({
        conversationId: { $in: conversationIds },
      })
        .select('conversationId endpoint title updatedAt')
        .lean();

      const convoMap = new Map(
        conversations.map((c: { conversationId: string; endpoint?: string; title?: string; updatedAt?: Date }) => [c.conversationId, c]),
      );

      const sharesList: t.SharedConversationListItem[] = results.map((share) => {
        const convo = convoMap.get(share.conversationId) as { endpoint?: string; title?: string; updatedAt?: Date } | undefined;
        return {
          conversationId: share.conversationId,
          ownerId: share.ownerId,
          ownerName: share.ownerName,
          ownerEmail: share.ownerEmail,
          title: convo?.title || share.title || 'Untitled',
          createdAt: share.createdAt,
          updatedAt: convo?.updatedAt || share.updatedAt,
          endpoint: convo?.endpoint,
        };
      });

      const nextCursor = hasNextPage
        ? (results[results.length - 1].updatedAt as Date)
        : undefined;

      return {
        shares: sharesList,
        nextCursor,
        hasNextPage,
      };
    } catch (error) {
      logger.error('[getSharedConversations] Error getting shared conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new SharedConversationError('Error getting shared conversations', 'FETCH_ERROR');
    }
  }

  /**
   * Check if a user has access to a shared conversation
   */
  async function hasSharedAccess(
    userId: string,
    conversationId: string,
  ): Promise<{ hasAccess: boolean; ownerId?: string }> {
    if (!userId || !conversationId) {
      logger.debug('[hasSharedAccess] Missing userId or conversationId', { userId, conversationId });
      return { hasAccess: false };
    }

    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;

      if (!SharedConversation) {
        logger.error('[hasSharedAccess] SharedConversation model not found');
        return { hasAccess: false };
      }

      logger.debug('[hasSharedAccess] Querying for share', {
        conversationId,
        sharedWithUserId: userId,
      });

      const share = await SharedConversation.findOne({
        conversationId,
        sharedWithUserId: userId,
      })
        .select('ownerId')
        .lean();

      logger.debug('[hasSharedAccess] Query result', {
        foundShare: !!share,
        ownerId: share?.ownerId,
      });

      if (share) {
        return { hasAccess: true, ownerId: share.ownerId };
      }

      return { hasAccess: false };
    } catch (error) {
      logger.error('[hasSharedAccess] Error checking shared access', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        conversationId,
      });
      return { hasAccess: false };
    }
  }

  /**
   * Delete all shares for a conversation (when conversation is deleted)
   */
  async function deleteAllConversationShares(
    ownerId: string,
    conversationId: string,
  ): Promise<{ deletedCount: number }> {
    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;

      const result = await SharedConversation.deleteMany({ conversationId, ownerId });

      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('[deleteAllConversationShares] Error deleting shares', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ownerId,
        conversationId,
      });
      throw new SharedConversationError('Error deleting conversation shares', 'DELETE_ERROR');
    }
  }

  /**
   * Update share titles when conversation title changes
   */
  async function updateShareTitle(
    ownerId: string,
    conversationId: string,
    title: string,
  ): Promise<void> {
    try {
      const SharedConversation = mongoose.models.SharedConversation as Model<t.ISharedConversation>;

      await SharedConversation.updateMany({ conversationId, ownerId }, { title });
    } catch (error) {
      logger.error('[updateShareTitle] Error updating share title', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ownerId,
        conversationId,
      });
      // Don't throw - this is a non-critical operation
    }
  }

  // Return all methods
  return {
    shareConversationWithUsers,
    revokeConversationShare,
    getConversationShares,
    getSharedConversations,
    hasSharedAccess,
    deleteAllConversationShares,
    updateShareTitle,
  };
}

export type SharedConversationMethods = ReturnType<typeof createSharedConversationMethods>;
