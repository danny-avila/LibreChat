const mongoose = require('mongoose');
const express = require('express');
const {
  isEnabled,
  generateCheckAccess,
  grantCreationPermissions,
  ensureLinkPermissions,
  isFileSnapshotEnabled,
  deleteSharedLinkWithCleanup,
  updateSharedLinkPermissionsExpiration,
  isActiveExpirationDate,
  getSharedLinkExpiration,
} = require('@librechat/api');
const {
  logger,
  runAsSystem,
  tenantStorage,
  createTempChatExpirationDate,
} = require('@librechat/data-schemas');
const { FileSources, PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  getSharedMessages,
  createSharedLink,
  updateSharedLink,
  getSharedLinks,
  getSharedLink,
  getSharedLinkFile,
  backfillSharedLinkFiles,
  getRoleByName,
} = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { cleanFileName, getContentDisposition } = require('~/server/utils/files');
const canAccessSharedLink = require('~/server/middleware/canAccessSharedLink');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const configMiddleware = require('~/server/middleware/config/app');
const router = express.Router();

const checkSharedLinksAccess = generateCheckAccess({
  permissionType: PermissionTypes.SHARED_LINKS,
  permissions: [Permissions.CREATE],
  getRoleByName,
});

const resolveSharedLinkExpiration = (req, conversationId) =>
  getSharedLinkExpiration(
    { req, conversationId },
    {
      getConvo: async (userId, sourceConversationId) => {
        const Conversation = mongoose.models.Conversation;
        return Conversation.findOne(
          { conversationId: sourceConversationId, user: userId },
          'isTemporary expiredAt',
        ).lean();
      },
      createExpirationDate: createTempChatExpirationDate,
      logger,
    },
  );

/**
 * Shared messages
 */
const allowSharedLinks =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

/** Run within the snapshot file's tenant context (mirrors canAccessSharedLink). */
const runWithTenant = (tenantId, fn) =>
  tenantId ? tenantStorage.run({ tenantId }, fn) : runAsSystem(fn);

/**
 * Resolve a snapshotted file for a shared link. A file_id absent from the
 * share's snapshot is denied (404) — this is what prevents a viewer from
 * reaching files outside the shared-link snapshot. Lazily backfills legacy
 * shares that predate the feature.
 */
const resolveShareFile = async (req, res, next) => {
  try {
    const { shareId, file_id } = req.params;
    let snapshot = await getSharedLinkFile(shareId, file_id);
    if (!snapshot && isFileSnapshotEnabled(req.config)) {
      snapshot = await backfillSharedLinkFiles(shareId, file_id);
    }
    if (!snapshot) {
      logger.warn(
        `[shareFileAccess] File ${file_id} not in snapshot for share ${shareId} (route ${req.originalUrl})`,
      );
      return res.status(404).json({ message: 'File not found in shared link' });
    }
    req.shareFile = snapshot;
    return next();
  } catch (error) {
    logger.error('[shareFileAccess] Error resolving shared file:', error);
    return res.status(500).json({ message: 'Error resolving shared file' });
  }
};

/** Stream (or redirect to) a snapshotted file from its original stored object. */
const streamSharedFile = async (req, res, file, disposition) => {
  const source = file.source || FileSources.local;
  const { getDownloadStream, getDownloadURL } = getStrategyFunctions(source);

  const isDirectSource = source === FileSources.s3 || source === FileSources.cloudfront;
  if (disposition === 'attachment' && getDownloadURL && isDirectSource) {
    try {
      const url = await getDownloadURL({
        req,
        file,
        customFilename: cleanFileName(file.filename),
        contentType: file.type || 'application/octet-stream',
      });
      if (url) {
        res.setHeader('Cache-Control', 'no-store');
        return res.redirect(302, url);
      }
    } catch (error) {
      logger.warn('[shareFileAccess] download URL generation failed, streaming instead:', error);
    }
  }

  if (!getDownloadStream) {
    return res.status(501).send('Not Implemented');
  }

  const fileStream = await getDownloadStream(req, file.storageKey || file.filepath);
  fileStream.on('error', (error) => {
    logger.error('[shareFileAccess] Stream error:', error);
  });

  if (disposition === 'attachment') {
    res.setHeader('Content-Disposition', getContentDisposition(file.filename, 'attachment'));
    res.setHeader('Content-Type', 'application/octet-stream');
  } else {
    res.setHeader('Content-Disposition', getContentDisposition(file.filename, 'inline'));
    res.setHeader('Content-Type', file.type || 'application/octet-stream');
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return fileStream.pipe(res);
};

if (allowSharedLinks) {
  router.get('/:shareId', optionalJwtAuth, canAccessSharedLink, async (req, res) => {
    try {
      const share = await getSharedMessages(req.params.shareId, req.shareResourceId);
      if (share) {
        res.set('Cache-Control', 'private, no-store');
        res.status(200).json(share);
      } else {
        res.status(404).end();
      }
    } catch (error) {
      logger.error('Error getting shared messages:', error);
      res.status(500).json({ message: 'Error getting shared messages' });
    }
  });

  /** Preview status (text/textFormat) for a snapshotted file, from the snapshot. */
  router.get(
    '/:shareId/files/:file_id/preview',
    optionalJwtAuth,
    configMiddleware,
    canAccessSharedLink,
    resolveShareFile,
    (req, res) => {
      const file = req.shareFile;
      const status = file.status || 'ready';
      const payload = { file_id: req.params.file_id, status };
      if (status === 'ready' && file.text != null) {
        payload.text = file.text;
        payload.textFormat = file.textFormat ?? null;
      } else if (status === 'failed' && file.previewError) {
        payload.previewError = file.previewError;
      }
      res.set('Cache-Control', 'private, no-store');
      return res.status(200).json(payload);
    },
  );

  /** Download a snapshotted file (attachment disposition). */
  router.get(
    '/:shareId/files/:file_id/download',
    optionalJwtAuth,
    configMiddleware,
    canAccessSharedLink,
    resolveShareFile,
    async (req, res) => {
      try {
        await runWithTenant(req.shareFile.tenantId, () =>
          streamSharedFile(req, res, req.shareFile, 'attachment'),
        );
      } catch (error) {
        logger.error('[shareFileAccess] Error downloading shared file:', error);
        if (!res.headersSent) {
          res.status(500).send('Error downloading file');
        }
      }
    },
  );

  /** Inline-serve a snapshotted file (image src, generic view). */
  router.get(
    '/:shareId/files/:file_id',
    optionalJwtAuth,
    configMiddleware,
    canAccessSharedLink,
    resolveShareFile,
    async (req, res) => {
      try {
        await runWithTenant(req.shareFile.tenantId, () =>
          streamSharedFile(req, res, req.shareFile, 'inline'),
        );
      } catch (error) {
        logger.error('[shareFileAccess] Error serving shared file:', error);
        if (!res.headersSent) {
          res.status(500).send('Error serving file');
        }
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

    if (share._id && share.success) {
      await ensureLinkPermissions(share._id, req.user.id);
    }

    return res.status(200).json({
      _id: share._id,
      success: share.success,
      shareId: share.shareId,
      targetMessageId: share.targetMessageId,
      conversationId: req.params.conversationId,
    });
  } catch (error) {
    logger.error('Error getting shared link:', error);
    res.status(500).json({ message: 'Error getting shared link' });
  }
});

router.post(
  '/:conversationId',
  requireJwtAuth,
  configMiddleware,
  checkSharedLinksAccess,
  async (req, res) => {
    try {
      const { targetMessageId } = req.body;
      const expiredAt = await resolveSharedLinkExpiration(req, req.params.conversationId);
      if (expiredAt != null && !isActiveExpirationDate(expiredAt)) {
        return res.status(404).end();
      }

      const role = await getRoleByName(req.user.role);
      const sharedLinksPerms = role?.permissions?.[PermissionTypes.SHARED_LINKS] || {};
      const grantPublic = sharedLinksPerms[Permissions.SHARE_PUBLIC] === true;
      const snapshotFiles = isFileSnapshotEnabled(req.config);

      const created = await createSharedLink(
        req.user.id,
        req.params.conversationId,
        targetMessageId,
        expiredAt,
        snapshotFiles,
      );
      if (created) {
        await grantCreationPermissions(created._id, req.user.id, grantPublic, expiredAt);
        res.status(200).json(created);
      } else {
        res.status(404).end();
      }
    } catch (error) {
      logger.error('Error creating shared link:', error);
      res.status(500).json({ message: 'Error creating shared link' });
    }
  },
);

router.patch('/:shareId', requireJwtAuth, configMiddleware, async (req, res) => {
  try {
    const { targetMessageId } = req.body ?? {};
    if (targetMessageId !== undefined && typeof targetMessageId !== 'string') {
      return res.status(400).json({ message: 'targetMessageId must be a string' });
    }

    let expiredAt;
    const SharedLink = mongoose.models.SharedLink;
    const existing = await SharedLink.findOne(
      { shareId: req.params.shareId, user: req.user.id },
      'conversationId',
    ).lean();
    if (existing?.conversationId) {
      expiredAt = await resolveSharedLinkExpiration(req, existing.conversationId);
    }
    if (expiredAt != null && !isActiveExpirationDate(expiredAt)) {
      return res.status(404).end();
    }

    const updatedShare = await updateSharedLink(
      req.user.id,
      req.params.shareId,
      targetMessageId,
      expiredAt,
      isFileSnapshotEnabled(req.config),
    );
    if (updatedShare) {
      if (updatedShare._id && expiredAt !== undefined) {
        await updateSharedLinkPermissionsExpiration(updatedShare._id, expiredAt);
      }
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
    const result = await deleteSharedLinkWithCleanup(req.user.id, req.params.shareId);

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
