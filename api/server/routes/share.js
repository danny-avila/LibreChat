const mongoose = require('mongoose');
const express = require('express');
const {
  isEnabled,
  generateCheckAccess,
  grantCreationPermissions,
  ensureLinkPermissions,
  isFileSnapshotEnabled,
  isFileSnapshotKillSwitchActive,
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
  getFiles,
  updateFile,
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
const optionalShareFileAuth = require('~/server/middleware/optionalShareFileAuth');
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

/** Mirrors the owner preview route: pending records older than this are swept to
 * 'failed' on the next poll so the client poller terminates. */
const PREVIEW_LAZY_SWEEP_CUTOFF_MS = 2 * 60 * 1000;

/**
 * MIME types that are safe to render inline. Everything else (text/html, SVG,
 * and other active content) is served as an `attachment` so a public viewer
 * can't execute uploaded bytes under the app origin by opening the URL directly.
 */
const SAFE_INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/x-icon',
  'application/pdf',
]);

/**
 * Resolve a snapshotted file for a shared link. A file_id absent from the
 * share's snapshot is denied (404) — this prevents a viewer from reaching files
 * outside the shared-link snapshot. Only legacy shares (no `fileSnapshots` field
 * at all) trigger a lazy backfill; an ordinary miss does not rebuild. The live
 * file record is also required: if the original was deleted/expired, return a
 * clean 404 instead of letting the stream error after headers are sent.
 */
const resolveShareFile = async (req, res, next) => {
  try {
    // Global kill switch only (env-based, viewer-independent): disabling stops
    // serving for every link. The viewer's own config must NOT affect serving.
    if (isFileSnapshotKillSwitchActive()) {
      return res.status(404).json({ message: 'Shared file access is disabled' });
    }

    const { shareId, file_id } = req.params;
    const { file, hasSnapshots, optedOut } = await getSharedLinkFile(shareId, file_id);
    // Per-link opt-out: never serve and never backfill an opted-out link.
    if (optedOut) {
      return res.status(404).json({ message: 'File not found in shared link' });
    }
    let snapshot = file;
    if (!snapshot && !hasSnapshots) {
      snapshot = await backfillSharedLinkFiles(shareId, file_id);
    }
    if (!snapshot) {
      logger.warn(
        `[shareFileAccess] File ${file_id} not in snapshot for share ${shareId} (route ${req.originalUrl})`,
      );
      return res.status(404).json({ message: 'File not found in shared link' });
    }

    const [liveFile] = await getFiles({ file_id }, null, {});
    if (!liveFile) {
      logger.warn(
        `[shareFileAccess] Snapshotted file ${file_id} no longer available for share ${shareId}`,
      );
      return res.status(404).json({ message: 'File no longer available' });
    }

    // Pin to the snapshotted version so an old link can't surface post-share content
    // after a reused file_id (e.g. code-exec same-filename outputs) is overwritten.
    // previewRevision changes for deferred/office files; `bytes` catches other
    // overwrites that change size, and is stable across S3 URL refresh and the
    // pending->ready transition (which don't alter file size). Same-size content
    // swaps remain a best-effort gap inherent to the no-byte-copy design.
    const revisionChanged =
      (snapshot.previewRevision ?? null) !== (liveFile.previewRevision ?? null);
    const bytesChanged =
      snapshot.bytes != null && liveFile.bytes != null && snapshot.bytes !== liveFile.bytes;
    if (revisionChanged || bytesChanged) {
      logger.warn(
        `[shareFileAccess] Snapshot version mismatch for file ${file_id} (share ${shareId})`,
      );
      return res.status(404).json({ message: 'File no longer available' });
    }

    req.shareFile = snapshot;
    req.liveFile = liveFile;
    return next();
  } catch (error) {
    logger.error('[shareFileAccess] Error resolving shared file:', error);
    return res.status(500).json({ message: 'Error resolving shared file' });
  }
};

/** Stream (or redirect to) a snapshotted file from its original stored object. */
const streamSharedFile = async (req, res, file, requestedDisposition) => {
  const source = file.source || FileSources.local;
  const { getDownloadStream, getDownloadURL } = getStrategyFunctions(source);

  // Inline only safe preview types; anything else is forced to attachment.
  const disposition =
    requestedDisposition === 'inline' && SAFE_INLINE_TYPES.has(file.type) ? 'inline' : 'attachment';

  // Redirect to a signed storage URL only when explicitly requested (?direct=true);
  // by default stream through the server so blob (XHR) callers work without bucket CORS.
  const isDirectSource = source === FileSources.s3 || source === FileSources.cloudfront;
  if (req.query.direct === 'true' && getDownloadURL && isDirectSource) {
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

  // Strip any cache-busting query string (e.g. code-output images add `?v=...`) so
  // the local stream resolves the real filename, not a literal `*.png?v=...` path.
  const streamPath = (file.storageKey || file.filepath || '').split('?')[0];
  const fileStream = await getDownloadStream(req, streamPath);
  fileStream.on('error', (error) => {
    logger.error('[shareFileAccess] Stream error:', error);
  });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', getContentDisposition(file.filename, disposition));
  res.setHeader(
    'Content-Type',
    disposition === 'inline' ? file.type || 'application/octet-stream' : 'application/octet-stream',
  );
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return fileStream.pipe(res);
};

if (allowSharedLinks) {
  router.get(
    '/:shareId',
    optionalJwtAuth,
    canAccessSharedLink,
    configMiddleware,
    async (req, res) => {
      try {
        const share = await getSharedMessages(req.params.shareId, req.shareResourceId, {
          // Viewer-independent: the per-link choice (stored on the share) decides
          // file inclusion; only a global env kill switch can force it off here.
          snapshotFiles: !isFileSnapshotKillSwitchActive(),
        });
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
    },
  );

  /**
   * Preview status for a snapshotted file. Read live from the file record so the
   * status is always current (deferred previews may resolve after the share was
   * created) and large extracted text is never embedded in the share document.
   */
  router.get(
    '/:shareId/files/:file_id/preview',
    optionalJwtAuth,
    optionalShareFileAuth,
    canAccessSharedLink,
    configMiddleware,
    resolveShareFile,
    async (req, res) => {
      try {
        const { file_id } = req.params;
        let liveFile = req.liveFile;
        // Lazy-sweep orphaned pending records to 'failed' so the client preview
        // poller reaches a terminal state (mirrors the owner preview route).
        if (liveFile?.status === 'pending' && liveFile.updatedAt instanceof Date) {
          const ageMs = Date.now() - liveFile.updatedAt.getTime();
          if (ageMs > PREVIEW_LAZY_SWEEP_CUTOFF_MS) {
            const swept = await updateFile(
              { file_id, status: 'failed', previewError: 'orphaned' },
              { status: 'pending', updatedAt: liveFile.updatedAt },
            );
            if (swept) {
              liveFile = swept;
            }
          }
        }
        const status = liveFile?.status || 'ready';
        const payload = { file_id, status };
        if (status === 'ready' && liveFile?.text != null) {
          payload.text = liveFile.text;
          payload.textFormat = liveFile.textFormat ?? null;
        } else if (status === 'failed' && liveFile?.previewError) {
          payload.previewError = liveFile.previewError;
        }
        res.set('Cache-Control', 'private, no-store');
        return res.status(200).json(payload);
      } catch (error) {
        logger.error('[shareFileAccess] Error fetching shared preview:', error);
        return res.status(500).json({ message: 'Error fetching preview' });
      }
    },
  );

  /** Download a snapshotted file (attachment disposition). */
  router.get(
    '/:shareId/files/:file_id/download',
    optionalJwtAuth,
    optionalShareFileAuth,
    canAccessSharedLink,
    configMiddleware,
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
    optionalShareFileAuth,
    canAccessSharedLink,
    configMiddleware,
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
      snapshotFiles: share.snapshotFiles,
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
      // Per-link opt-out: snapshot only when the feature is enabled AND the user
      // did not uncheck "share files" (body flag absent defaults to enabled).
      const snapshotFiles = isFileSnapshotEnabled(req.config) && req.body?.snapshotFiles !== false;

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
      isFileSnapshotEnabled(req.config) && req.body?.snapshotFiles !== false,
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
