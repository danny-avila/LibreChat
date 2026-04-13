const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const {
  createSkillsHandlers,
  createImportHandler,
  generateCheckAccess,
} = require('@librechat/api');
const { isValidObjectIdString, logger } = require('@librechat/data-schemas');
const {
  PermissionBits,
  PermissionTypes,
  Permissions,
  FileContext,
} = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  upsertSkillFile,
  deleteSkillFile,
  getSkillFileByPath,
  updateSkillFileContent,
  getRoleByName,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  grantPermission,
} = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');
const configMiddleware = require('~/server/middleware/config/app');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer: memory storage for skill imports (zip processed in-memory)
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.md', '.zip', '.skill']);
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

const memoryStorage = multer.memoryStorage();

const skillImportFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    // N.B. The error handler at the bottom of this file matches this "Only " prefix.
    cb(new Error('Only .md, .zip, and .skill files are allowed'), false);
  }
};

const skillUpload = multer({
  storage: memoryStorage,
  fileFilter: skillImportFilter,
  limits: { fileSize: MAX_IMPORT_SIZE },
});

// Per-file upload (for adding individual files to an existing skill)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const singleFileUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_SINGLE_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// Role-based capability gates
// ---------------------------------------------------------------------------
const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSkillCreate = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

// ---------------------------------------------------------------------------
// Rate limiters (reuse existing file upload limiters)
// ---------------------------------------------------------------------------
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------
const handlers = createSkillsHandlers({
  createSkill,
  getSkillById,
  listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  deleteSkillFile,
  getSkillFileByPath,
  updateSkillFileContent,
  getStrategyFunctions,
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  grantPermission,
  isValidObjectIdString,
});

// ---------------------------------------------------------------------------
// File storage helper: resolve the active strategy's saveBuffer
// ---------------------------------------------------------------------------
function resolveSkillStorage(req, { isImage = false } = {}) {
  const source = getFileStrategy(req.config, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { saveBuffer: strategy.saveBuffer, source };
}

// ---------------------------------------------------------------------------
// Import handler (zip/md/skill → create skill + files)
// ---------------------------------------------------------------------------
const importHandler = createImportHandler({
  createSkill,
  deleteSkill,
  upsertSkillFile,
  saveBuffer: (req, { userId, buffer, fileName, basePath, isImage }) => {
    const storage = resolveSkillStorage(req, { isImage });
    return storage.saveBuffer({ userId, buffer, fileName, basePath }).then((filepath) => ({
      filepath,
      source: storage.source,
    }));
  },
  deleteFile: (req, filepath) => {
    // Resolve source from filepath pattern — uploads use the skill_file strategy
    const source = getFileStrategy(req.config, { context: FileContext.skill_file });
    const { deleteFile } = getStrategyFunctions(source);
    if (deleteFile) {
      return deleteFile(req, filepath);
    }
    return Promise.resolve();
  },
  grantPermission,
});

// ---------------------------------------------------------------------------
// Per-file upload handler (add a single file to an existing skill)
// ---------------------------------------------------------------------------
async function uploadFileHandler(req, res) {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const skillId = req.params.id;
    const relativePath = req.body.relativePath;
    if (!relativePath) {
      return res.status(400).json({ error: 'relativePath is required in form body' });
    }
    if (relativePath.toUpperCase() === 'SKILL.MD') {
      return res.status(400).json({ error: 'SKILL.md is reserved; update the skill body instead' });
    }
    // Reject traversal, absolute paths, empty/dot segments — matches model-layer validator
    // so storage writes don't happen before DB rejects the path.
    if (
      !/^[a-zA-Z0-9._\-/]+$/.test(relativePath) ||
      /^\//.test(relativePath) ||
      relativePath.split('/').some((s) => s === '' || s === '.' || s === '..')
    ) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const fileId = crypto.randomUUID();
    const filename = file.originalname;
    const storageFileName = `${fileId}__${filename}`;

    const isImage = (file.mimetype || '').startsWith('image/');
    const storage = resolveSkillStorage(req, { isImage });
    const filepath = await storage.saveBuffer({
      userId: req.user.id,
      buffer: file.buffer,
      fileName: storageFileName,
      basePath: 'uploads',
    });

    let result;
    try {
      result = await upsertSkillFile({
        skillId,
        relativePath,
        file_id: fileId,
        filename,
        filepath,
        source: storage.source,
        mimeType: file.mimetype || 'application/octet-stream',
        bytes: file.size,
        isExecutable: false,
        author: req.user._id,
      });
    } catch (dbError) {
      // Clean up the stored blob so it doesn't leak on DB failure
      try {
        const { deleteFile } = getStrategyFunctions(storage.source);
        if (deleteFile) {
          await deleteFile(req, filepath);
        }
      } catch (cleanupErr) {
        logger.error('[uploadFile] Failed to clean up orphaned blob:', cleanupErr);
      }
      throw dbError;
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'SKILL_FILE_VALIDATION_FAILED') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('[uploadFile] Error:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Import: accepts .md / .zip / .skill via multipart
router.post(
  '/import',
  checkSkillCreate,
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  skillUpload.single('file'),
  importHandler,
);

router.get('/', handlers.list);
router.post('/', checkSkillCreate, handlers.create);

router.get(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);

router.patch(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.patch,
);

router.delete(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.DELETE }),
  handlers.delete,
);

router.get(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listFiles,
);

// Per-file upload (live — replaces 501 stub)
router.post(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  singleFileUpload.single('file'),
  uploadFileHandler,
);

router.get(
  '/:id/files/:relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.downloadFile,
);

router.delete(
  '/:id/files/:relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

// Multer + file-filter error handler — surface as 400, forward everything else

router.use((err, _req, res, next) => {
  if (err && (err.name === 'MulterError' || err.message?.startsWith('Only '))) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
