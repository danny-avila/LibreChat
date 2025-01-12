const { nanoid } = require('nanoid');
const { Constants } = require('librechat-data-provider');
const { Conversation } = require('~/models/Conversation');
const SharedLink = require('./schema/shareSchema');
const { getMessages } = require('./Message');
const logger = require('~/config/winston');

class ShareServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ShareServiceError';
    this.code = code;
  }
}

const memoizedAnonymizeId = (prefix) => {
  const memo = new Map();
  return (id) => {
    if (!memo.has(id)) {
      memo.set(id, `${prefix}_${nanoid()}`);
    }
    return memo.get(id);
  };
};

const anonymizeConvoId = memoizedAnonymizeId('convo');
const anonymizeAssistantId = memoizedAnonymizeId('a');
const anonymizeMessageId = (id) =>
  id === Constants.NO_PARENT ? id : memoizedAnonymizeId('msg')(id);

function anonymizeConvo(conversation) {
  if (!conversation) {
    return null;
  }

  const newConvo = { ...conversation };
  if (newConvo.assistant_id) {
    newConvo.assistant_id = anonymizeAssistantId(newConvo.assistant_id);
  }
  return newConvo;
}

function anonymizeMessages(messages, newConvoId) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const idMap = new Map();
  return messages.map((message) => {
    const newMessageId = anonymizeMessageId(message.messageId);
    idMap.set(message.messageId, newMessageId);

    return {
      ...message,
      messageId: newMessageId,
      parentMessageId:
        idMap.get(message.parentMessageId) || anonymizeMessageId(message.parentMessageId),
      conversationId: newConvoId,
      model: message.model?.startsWith('asst_')
        ? anonymizeAssistantId(message.model)
        : message.model,
    };
  });
}

async function getSharedMessages(shareId) {
  try {
    const share = await SharedLink.findOne({ shareId })
      .populate({
        path: 'messages',
        select: '-_id -__v -user',
      })
      .select('-_id -__v -user')
      .lean()
      .exec();

    if (!share?.conversationId || !share.isPublic) {
      return null;
    }

    const newConvoId = anonymizeConvoId(share.conversationId);
    const result = {
      ...share,
      conversationId: newConvoId,
      messages: anonymizeMessages(share.messages, newConvoId),
    };

    return result;
  } catch (error) {
    logger.error('[getShare] Error getting share link', {
      error: error.message,
      shareId,
    });
    throw new ShareServiceError('Error getting share link', 'SHARE_FETCH_ERROR');
  }
}

async function getSharedLinks(user, pageParam, pageSize, isPublic, sortBy, sortDirection, search) {
  try {
    const query = { user, isPublic };

    if (pageParam) {
      if (sortDirection === 'desc') {
        query[sortBy] = { $lt: pageParam };
      } else {
        query[sortBy] = { $gt: pageParam };
      }
    }

    if (search) {
      const searchResults = await Conversation.meiliSearch(search, {
        attributesToHighlight: ['title'],
      });

      const conversationIds = searchResults.hits.map((hit) => hit.id);
      query['conversation'] = { $in: conversationIds };
    }

    const sort = {};
    sort[sortBy] = sortDirection === 'desc' ? -1 : 1;

    const sharedLinks = await SharedLink.find(query)
      .sort(sort)
      .limit(pageSize + 1)
      .select('-__v -user')
      .lean()
      .exec();

    const hasNextPage = sharedLinks.length > pageSize;
    const links = sharedLinks.slice(0, pageSize);

    const nextCursor = hasNextPage ? links[links.length - 1][sortBy] : undefined;

    return {
      links: links.map((link) => ({
        shareId: link.shareId,
        title: link?.title || 'Untitled',
        isPublic: link.isPublic,
        createdAt: link.createdAt,
      })),
      nextCursor,
      hasNextPage,
    };
  } catch (error) {
    logger.error('[getSharedLinks] Error getting shares', {
      error: error.message,
      user,
    });
    throw new ShareServiceError('Error getting shares', 'SHARES_FETCH_ERROR');
  }
}

async function deleteAllSharedLinks(user) {
  try {
    const result = await SharedLink.deleteMany({ user }).exec();
    return {
      message: 'All shared links deleted successfully',
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error('[deleteAllSharedLinks] Error deleting shared links', {
      error: error.message,
      user,
    });
    throw new ShareServiceError('Error deleting shared links', 'BULK_DELETE_ERROR');
  }
}

async function createSharedLink(user, conversationId) {
  if (!user || !conversationId) {
    throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
  }

  try {
    const [existingShare, conversationMessages] = await Promise.all([
      SharedLink.findOne({ conversationId }).select('-_id -__v -user').lean().exec(),
      getMessages({ conversationId }),
    ]);

    if (existingShare) {
      throw new ShareServiceError('Share already exists', 'SHARE_EXISTS');
    }

    const title = conversationMessages[0]?.title || 'Untitled';

    const shareId = nanoid();
    await SharedLink.create({
      shareId,
      conversationId,
      messages: conversationMessages,
      title,
      user,
    });

    return { shareId, conversationId };
  } catch (error) {
    logger.error('[createSharedLink] Error creating shared link', {
      error: error.message,
      user,
      conversationId,
    });
    throw new ShareServiceError('Error creating shared link', 'SHARE_CREATE_ERROR');
  }
}

async function getSharedLink(user, conversationId) {
  if (!user || !conversationId) {
    throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
  }

  try {
    const share = await SharedLink.findOne({ conversationId, user })
      .select('shareId -_id')
      .lean()
      .exec();

    if (!share) {
      return { shareId: null, success: false };
    }

    return { shareId: share.shareId, success: true };
  } catch (error) {
    logger.error('[getSharedLink] Error getting shared link', {
      error: error.message,
      user,
      conversationId,
    });
    throw new ShareServiceError('Error getting shared link', 'SHARE_FETCH_ERROR');
  }
}

async function updateSharedLink(user, shareId) {
  if (!user || !shareId) {
    throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
  }

  try {
    const share = await SharedLink.findOne({ shareId }).select('-_id -__v -user').lean().exec();

    if (!share) {
      throw new ShareServiceError('Share not found', 'SHARE_NOT_FOUND');
    }

    const [updatedMessages] = await Promise.all([
      getMessages({ conversationId: share.conversationId }),
    ]);

    const newShareId = nanoid();
    const update = {
      messages: updatedMessages,
      user,
      shareId: newShareId,
    };

    const updatedShare = await SharedLink.findOneAndUpdate({ shareId, user }, update, {
      new: true,
      upsert: false,
      runValidators: true,
    })
      .lean()
      .exec();

    if (!updatedShare) {
      throw new ShareServiceError('Share update failed', 'SHARE_UPDATE_ERROR');
    }

    anonymizeConvo(updatedShare);

    return { shareId: newShareId, conversationId: updatedShare.conversationId };
  } catch (error) {
    logger.error('[updateSharedLink] Error updating shared link', {
      error: error.message,
      user,
      shareId,
    });
    throw new ShareServiceError(
      error.code === 'SHARE_UPDATE_ERROR' ? error.message : 'Error updating shared link',
      error.code || 'SHARE_UPDATE_ERROR',
    );
  }
}

async function deleteSharedLink(user, shareId) {
  if (!user || !shareId) {
    throw new ShareServiceError('Missing required parameters', 'INVALID_PARAMS');
  }

  try {
    const result = await SharedLink.findOneAndDelete({ shareId, user }).lean().exec();

    if (!result) {
      return null;
    }

    return {
      success: true,
      shareId,
      message: 'Share deleted successfully',
    };
  } catch (error) {
    logger.error('[deleteSharedLink] Error deleting shared link', {
      error: error.message,
      user,
      shareId,
    });
    throw new ShareServiceError('Error deleting shared link', 'SHARE_DELETE_ERROR');
  }
}

module.exports = {
  SharedLink,
  getSharedLink,
  getSharedLinks,
  createSharedLink,
  updateSharedLink,
  deleteSharedLink,
  getSharedMessages,
  deleteAllSharedLinks,
};
