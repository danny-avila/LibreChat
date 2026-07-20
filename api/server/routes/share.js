const express = require('express');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  deleteSharedLink,
  getSharedLinks,
  getSharedLink,
} = require('~/models');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { SharedLink } = require('~/db/models');
const mongoose = require('mongoose');
const router = express.Router();

/** BKL: 공유 조회 로그 기록 + 조회수 증가 (실패해도 조회 자체는 진행) */
async function recordShareView(req, shareId) {
  try {
    await SharedLink.updateOne({ shareId }, { $inc: { viewCount: 1 } });
    const conn = mongoose.connection;
    if (conn?.readyState === 1) {
      await conn.db.collection('bkl_share_views').insertOne({
        shareId,
        ts: new Date(),
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
        ua: req.headers['user-agent'] || null,
        viewer: req.user?.id ? String(req.user.id) : null,
      });
    }
  } catch (err) {
    logger.warn('[share] failed to record share view', err);
  }
}

/**
 * Shared messages
 */
const allowSharedLinks =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

if (allowSharedLinks) {
  const allowSharedLinksPublic = isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC);
  router.get(
    '/:shareId',
    allowSharedLinksPublic ? (req, res, next) => next() : requireJwtAuth,
    async (req, res) => {
      try {
        /** BKL: 만료 검사 — 만료된 링크는 안내 응답 (410) */
        const linkMeta = await SharedLink.findOne({ shareId: req.params.shareId })
          .select('expiresAt isPublic')
          .lean();
        if (linkMeta?.expiresAt && new Date(linkMeta.expiresAt) <= new Date()) {
          return res.status(410).json({
            message: '공유 링크가 만료되었습니다.',
            expired: true,
            expiresAt: linkMeta.expiresAt,
          });
        }

        const share = await getSharedMessages(req.params.shareId);

        if (share) {
          recordShareView(req, req.params.shareId);
          res.status(200).json(share);
        } else {
          res.status(404).end();
        }
      } catch (error) {
        logger.error('Error getting shared messages:', error);
        res.status(500).json({ message: 'Error getting shared messages' });
      }
    },
  );
}

/**
 * Shared links
 */
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const params = {
      pageParam: req.query.cursor,
      pageSize: Math.max(1, parseInt(req.query.pageSize) || 10),
      isPublic: isEnabled(req.query.isPublic),
      sortBy: ['createdAt', 'title'].includes(req.query.sortBy) ? req.query.sortBy : 'createdAt',
      sortDirection: ['asc', 'desc'].includes(req.query.sortDirection)
        ? req.query.sortDirection
        : 'desc',
      search: req.query.search ? decodeURIComponent(req.query.search.trim()) : undefined,
    };

    const result = await getSharedLinks(
      req.user.id,
      params.pageParam,
      params.pageSize,
      params.isPublic,
      params.sortBy,
      params.sortDirection,
      params.search,
    );

    res.status(200).send({
      links: result.links,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    });
  } catch (error) {
    logger.error('Error getting shared links:', error);
    res.status(500).json({
      message: 'Error getting shared links',
      error: error.message,
    });
  }
});

router.get('/link/:conversationId', requireJwtAuth, async (req, res) => {
  try {
    const share = await getSharedLink(req.user.id, req.params.conversationId);

    return res.status(200).json({
      success: share.success,
      shareId: share.shareId,
      conversationId: req.params.conversationId,
    });
  } catch (error) {
    logger.error('Error getting shared link:', error);
    res.status(500).json({ message: 'Error getting shared link' });
  }
});

router.post('/:conversationId', requireJwtAuth, async (req, res) => {
  try {
    const { targetMessageId } = req.body;
    const created = await createSharedLink(req.user.id, req.params.conversationId, targetMessageId);
    if (created) {
      /** BKL: 기본 만료 설정 (BKL_SHARE_TTL_DAYS, 기본 30일, 0 = 무제한) */
      const ttlDays = parseFloat(process.env.BKL_SHARE_TTL_DAYS ?? '30');
      if (Number.isFinite(ttlDays) && ttlDays > 0 && created.shareId) {
        try {
          await SharedLink.updateOne(
            { shareId: created.shareId },
            { $set: { expiresAt: new Date(Date.now() + ttlDays * 24 * 3600 * 1000) } },
          );
        } catch (err) {
          logger.warn('[share] failed to set default expiry', err);
        }
      }
      res.status(200).json(created);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('Error creating shared link:', error);
    res.status(500).json({ message: 'Error creating shared link' });
  }
});

router.patch('/:shareId', requireJwtAuth, async (req, res) => {
  try {
    const updatedShare = await updateSharedLink(req.user.id, req.params.shareId);
    if (updatedShare) {
      res.status(200).json(updatedShare);
    } else {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('Error updating shared link:', error);
    res.status(500).json({ message: 'Error updating shared link' });
  }
});

router.delete('/:shareId', requireJwtAuth, async (req, res) => {
  try {
    const result = await deleteSharedLink(req.user.id, req.params.shareId);

    if (!result) {
      return res.status(404).json({ message: 'Share not found' });
    }

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error deleting shared link:', error);
    return res.status(400).json({ message: 'Error deleting shared link' });
  }
});

module.exports = router;
