const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { deleteConvos } = require('~/models/Conversation');
const { deleteToolCalls } = require('~/models/ToolCall');
const { getDb, loadUsers } = require('./helpers');

const router = express.Router();

/** 항목 11: 어드민 "삭제된 채팅" 관리 — 목록 / 복원 / 최종 삭제 */

router.get('/deleted-convos', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 200, 1000));
    const db = getDb();
    const convos = await db
      .collection('conversations')
      .find(
        { bklDeletedAt: { $exists: true } },
        { projection: { conversationId: 1, title: 1, user: 1, createdAt: 1, updatedAt: 1, bklDeletedAt: 1 } },
      )
      .sort({ bklDeletedAt: -1 })
      .limit(limit)
      .toArray();

    const convoIds = convos.map((c) => c.conversationId).filter(Boolean);
    let countMap = new Map();
    if (convoIds.length) {
      const counts = await db
        .collection('messages')
        .aggregate([
          { $match: { conversationId: { $in: convoIds } } },
          { $group: { _id: '$conversationId', msg_count: { $sum: 1 } } },
        ])
        .toArray();
      countMap = new Map(counts.map((c) => [c._id, c.msg_count]));
    }

    const userMap = await loadUsers(db, [...new Set(convos.map((c) => c.user).filter(Boolean))], {
      name: 1,
      username: 1,
      email: 1,
      bkl_user_class: 1,
    });

    const retentionDays = parseInt(process.env.BKL_CHAT_RETENTION_DAYS, 10) || 60;
    res.json({
      retention_days: retentionDays,
      data: convos.map((convo) => {
        const user = userMap.get(String(convo.user)) || {};
        const purgeAt = convo.bklDeletedAt
          ? new Date(new Date(convo.bklDeletedAt).getTime() + retentionDays * 24 * 3600 * 1000)
          : null;
        return {
          conversation_id: convo.conversationId,
          title: convo.title || '(untitled)',
          user_id: String(convo.user),
          user_name: user.name ?? user.username ?? null,
          user_email: user.email ?? null,
          msg_count: countMap.get(convo.conversationId) ?? 0,
          created_at: convo.createdAt,
          deleted_at: convo.bklDeletedAt,
          purge_at: purgeAt,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.post('/deleted-convos/restore', async (req, res) => {
  try {
    const { conversation_id: conversationId } = req.body || {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversation_id required' });
    }
    const result = await getDb()
      .collection('conversations')
      .updateOne({ conversationId }, { $unset: { bklDeletedAt: 1 } });
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    res.json({ restored: result.modifiedCount === 1 });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.delete('/deleted-convos', async (req, res) => {
  try {
    const { conversation_id: conversationId } = req.body || {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversation_id required' });
    }
    const db = getDb();
    const convo = await db
      .collection('conversations')
      .findOne({ conversationId }, { projection: { user: 1, bklDeletedAt: 1 } });
    if (!convo) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    if (!convo.bklDeletedAt) {
      return res.status(400).json({ error: 'conversation is not soft-deleted' });
    }
    const result = await deleteConvos(convo.user, { conversationId });
    try {
      await deleteToolCalls(convo.user, conversationId);
    } catch (toolErr) {
      logger.warn('[bklAdmin/deleted] failed to delete tool calls', toolErr);
    }
    res.json({ deleted: result.deletedCount ?? 0, messages: result.messages?.deletedCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
