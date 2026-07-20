const express = require('express');
const { getDb, loadUsers } = require('./helpers');

const router = express.Router();

/** 항목 9: 공유 링크 관리 — 전체 목록 / 접속 로그 / 비활성화 / 삭제 */

router.get('/shares', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 500, 2000));
    const db = getDb();
    const links = await db
      .collection('sharedlinks')
      .find(
        {},
        {
          projection: {
            shareId: 1,
            conversationId: 1,
            title: 1,
            user: 1,
            isPublic: 1,
            expiresAt: 1,
            viewCount: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const userMap = await loadUsers(db, [...new Set(links.map((l) => l.user).filter(Boolean))], {
      name: 1,
      username: 1,
      email: 1,
    });

    const now = new Date();
    res.json({
      data: links.map((link) => {
        const user = userMap.get(String(link.user)) || {};
        return {
          share_id: link.shareId,
          conversation_id: link.conversationId,
          title: link.title || '(untitled)',
          user_id: String(link.user),
          user_name: user.name ?? user.username ?? null,
          user_email: user.email ?? null,
          is_public: link.isPublic !== false,
          expires_at: link.expiresAt ?? null,
          expired: link.expiresAt != null && new Date(link.expiresAt) <= now,
          view_count: link.viewCount ?? 0,
          created_at: link.createdAt,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/shares/views', async (req, res) => {
  try {
    const { share_id: shareId } = req.query;
    if (!shareId) {
      return res.status(400).json({ error: 'share_id required' });
    }
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 200, 1000));
    const db = getDb();
    const views = await db
      .collection('bkl_share_views')
      .find({ shareId }, { projection: { _id: 0 } })
      .sort({ ts: -1 })
      .limit(limit)
      .toArray();

    const userMap = await loadUsers(db, [...new Set(views.map((v) => v.viewer).filter(Boolean))], {
      name: 1,
      username: 1,
    });
    res.json({
      data: views.map((view) => ({
        ...view,
        viewer_name: view.viewer ? (userMap.get(String(view.viewer))?.name ?? null) : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/** 비활성화 (isPublic=false) 또는 재활성화 */
router.post('/shares/set-active', async (req, res) => {
  try {
    const { share_id: shareId, is_public: isPublic } = req.body || {};
    if (!shareId || typeof isPublic !== 'boolean') {
      return res.status(400).json({ error: 'share_id and is_public(boolean) required' });
    }
    const result = await getDb()
      .collection('sharedlinks')
      .updateOne({ shareId }, { $set: { isPublic } });
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'share not found' });
    }
    res.json({ updated: result.modifiedCount === 1 });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/** 만료 시각 변경 (expires_at: ISO 문자열 또는 null = 무제한) */
router.post('/shares/set-expiry', async (req, res) => {
  try {
    const { share_id: shareId, expires_at: expiresAt } = req.body || {};
    if (!shareId) {
      return res.status(400).json({ error: 'share_id required' });
    }
    const value = expiresAt == null ? null : new Date(expiresAt);
    if (value != null && Number.isNaN(value.getTime())) {
      return res.status(400).json({ error: 'invalid expires_at' });
    }
    const result = await getDb()
      .collection('sharedlinks')
      .updateOne({ shareId }, { $set: { expiresAt: value } });
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'share not found' });
    }
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.delete('/shares', async (req, res) => {
  try {
    const { share_id: shareId } = req.body || {};
    if (!shareId) {
      return res.status(400).json({ error: 'share_id required' });
    }
    const result = await getDb().collection('sharedlinks').deleteOne({ shareId });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'share not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
