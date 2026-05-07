const mongoose = require('mongoose');
const { User, Conversation, Message } = require('~/db/models');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Fields returned for conversation metadata listings (no message content).
const CONVO_META_FIELDS = 'conversationId title user createdAt updatedAt';

// Fields returned for message metadata (no `text` or content arrays).
const MESSAGE_META_FIELDS =
  'messageId conversationId user model endpoint sender parentMessageId tokenCount isCreatedByUser createdAt updatedAt';

// Fields returned for full message content.
const MESSAGE_CONTENT_FIELDS =
  'messageId conversationId user model endpoint sender parentMessageId tokenCount isCreatedByUser text content createdAt updatedAt';

function clampLimit(limit) {
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function clampPage(page) {
  const parsed = parseInt(page, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE;
  }
  return parsed;
}

function assertUserObjectId(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Invalid user id');
    err.code = 'INVALID_USER_ID';
    throw err;
  }
}

function assertConversationId(conversationId) {
  if (
    typeof conversationId !== 'string' ||
    conversationId.length < 1 ||
    conversationId.length > 256
  ) {
    const err = new Error('Invalid conversation id');
    err.code = 'INVALID_CONVERSATION_ID';
    throw err;
  }
}

function assertMessageId(messageId) {
  if (typeof messageId !== 'string' || messageId.length < 1 || messageId.length > 256) {
    const err = new Error('Invalid message id');
    err.code = 'INVALID_MESSAGE_ID';
    throw err;
  }
}

async function assertUserExists(userId) {
  const exists = await User.exists({ _id: userId });
  if (!exists) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
}

/**
 * List conversations belonging to a user. Returns metadata only.
 * @param {string} userId
 * @param {{ page?: number|string, limit?: number|string }} opts
 */
async function listConversationsForUser(userId, { page, limit } = {}) {
  assertUserObjectId(userId);
  await assertUserExists(userId);

  const p = clampPage(page);
  const l = clampLimit(limit);
  const skip = (p - 1) * l;

  // Conversation.user is stored as a String of the user ObjectId.
  const filter = { user: String(userId) };

  const [convos, total] = await Promise.all([
    Conversation.find(filter)
      .select(CONVO_META_FIELDS)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  if (convos.length === 0) {
    return { items: [], page: p, limit: l, total };
  }

  // Aggregate message counts and lastMessageAt per conversationId in one pass
  // so we don't issue O(n) queries.
  const ids = convos.map((c) => c.conversationId);
  const stats = await Message.aggregate([
    { $match: { user: String(userId), conversationId: { $in: ids } } },
    {
      $group: {
        _id: '$conversationId',
        messageCount: { $sum: 1 },
        lastMessageAt: { $max: '$createdAt' },
      },
    },
  ]);
  const statsMap = new Map(stats.map((s) => [s._id, s]));

  const items = convos.map((c) => ({
    conversationId: c.conversationId,
    title: c.title || 'New Chat',
    messageCount: statsMap.get(c.conversationId)?.messageCount || 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastMessageAt: statsMap.get(c.conversationId)?.lastMessageAt || null,
  }));

  return { items, page: p, limit: l, total };
}

/**
 * Get a single conversation owned by the given user. Metadata + counts only.
 */
async function getConversation(userId, conversationId) {
  assertUserObjectId(userId);
  assertConversationId(conversationId);

  const convo = await Conversation.findOne({
    user: String(userId),
    conversationId,
  })
    .select(CONVO_META_FIELDS)
    .lean();

  if (!convo) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  const stats = await Message.aggregate([
    { $match: { user: String(userId), conversationId } },
    {
      $group: {
        _id: '$conversationId',
        messageCount: { $sum: 1 },
        lastMessageAt: { $max: '$createdAt' },
        firstMessageAt: { $min: '$createdAt' },
      },
    },
  ]);
  const stat = stats[0] || { messageCount: 0, lastMessageAt: null, firstMessageAt: null };

  return {
    conversationId: convo.conversationId,
    title: convo.title || 'New Chat',
    createdAt: convo.createdAt,
    updatedAt: convo.updatedAt,
    messageCount: stat.messageCount,
    firstMessageAt: stat.firstMessageAt,
    lastMessageAt: stat.lastMessageAt,
  };
}

/**
 * List messages in a conversation owned by the given user. When
 * includeContent is false, the `text` field is stripped via projection.
 */
async function listMessages(userId, conversationId, { page, limit, includeContent } = {}) {
  assertUserObjectId(userId);
  assertConversationId(conversationId);

  // Ownership check: confirm the conversation belongs to userId.
  const owns = await Conversation.findOne({
    user: String(userId),
    conversationId,
  })
    .select('_id')
    .lean();
  if (!owns) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  const p = clampPage(page);
  const l = clampLimit(limit);
  const skip = (p - 1) * l;

  const filter = { user: String(userId), conversationId };
  const projection = includeContent ? MESSAGE_CONTENT_FIELDS : MESSAGE_META_FIELDS;

  const [items, total] = await Promise.all([
    Message.find(filter).select(projection).sort({ createdAt: 1 }).skip(skip).limit(l).lean(),
    Message.countDocuments(filter),
  ]);

  return { items, page: p, limit: l, total, includeContent: Boolean(includeContent) };
}

/**
 * Fetch a single message by messageId. Always includes full content.
 */
async function getMessage(messageId) {
  assertMessageId(messageId);
  const msg = await Message.findOne({ messageId }).select(MESSAGE_CONTENT_FIELDS).lean();
  if (!msg) {
    const err = new Error('Message not found');
    err.code = 'MESSAGE_NOT_FOUND';
    throw err;
  }
  return msg;
}

module.exports = {
  listConversationsForUser,
  getConversation,
  listMessages,
  getMessage,
  _internal: {
    MAX_LIMIT,
    CONVO_META_FIELDS,
    MESSAGE_META_FIELDS,
    MESSAGE_CONTENT_FIELDS,
  },
};
