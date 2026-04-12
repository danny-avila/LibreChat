const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const {
  createSkillsHandlers,
  createImportHandler,
  generateCheckAccess,
} = require('@librechat/api');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const {
  PermissionBits,
  PermissionTypes,
  Permissions,
  FileSources,
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
  getRoleByName,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
} = require('~/server/services/PermissionService');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer: memory storage for skill imports (zip processed in-memory)
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.md', '.zip', '.skill']);
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

const skillImportStorage = multer.memoryStorage();

const skillImportFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .md, .zip, and .skill files are allowed'), false);
  }
};

const skillUpload = multer({
  storage: skillImportStorage,
  fileFilter: skillImportFilter,
  limits: { fileSize: MAX_IMPORT_SIZE },
});

// Per-file upload (for adding individual files to an existing skill)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const singleFileStorage = multer.memoryStorage();
const singleFileUpload = multer({
  storage: singleFileStorage,
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
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
  isValidObjectIdString,
});

// ---------------------------------------------------------------------------
// File storage helper: resolve the active strategy's saveBuffer
// ---------------------------------------------------------------------------
function saveBuffer({ userId, buffer, fileName, basePath = 'uploads' }) {
  const strategy = getStrategyFunctions(FileSources.local);
  return strategy.saveBuffer({ userId, buffer, fileName, basePath });
}

// ---------------------------------------------------------------------------
// Import handler (zip/md/skill → create skill + files)
// ---------------------------------------------------------------------------
const importHandler = createImportHandler({
  createSkill,
  upsertSkillFile,
  saveBuffer,
});

// ---------------------------------------------------------------------------
// Per-file upload handler (add a single file to an existing skill)
// ---------------------------------------------------------------------------
async function uploadFileHandler(req, res) {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const skillId = req.params.id;
    const relativePath = req.body.relativePath;
    if (!relativePath) {
      return res.status(400).json({ message: 'relativePath is required in form body' });
    }

    const fileId = crypto.randomUUID();
    const filename = file.originalname;
    const storageFileName = `${fileId}__${filename}`;

    const filepath = await saveBuffer({
      userId: req.user.id,
      buffer: file.buffer,
      fileName: storageFileName,
    });

    const result = await upsertSkillFile({
      skillId,
      relativePath,
      file_id: fileId,
      filename,
      filepath,
      source: FileSources.local,
      mimeType: file.mimetype || 'application/octet-stream',
      bytes: file.size,
      isExecutable: false,
      author: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.message && error.message.includes('SKILL_FILE_VALIDATION')) {
      return res.status(400).json({ message: error.message });
    }
    console.error('[uploadFile] Error:', error);
    return res.status(500).json({ message: 'Failed to upload file' });
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
  handlers.downloadFileStub,
);

router.delete(
  '/:id/files/:relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

module.exports = router;
