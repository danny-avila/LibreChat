const multer = require('multer');
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  fetchTarsModelOptions,
  createTarsKnowledgeBase,
  updateTarsKnowledgeBase,
  deleteTarsKnowledgeBase,
  fetchTarsKnowledgeBases,
  createTarsKnowledgeBaseWithFile,
} = require('@librechat/api');
const { requireJwtAuth, requireTarsAdmin } = require('~/server/middleware');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireJwtAuth);
router.use(requireTarsAdmin);

/**
 * @route GET /api/tars/knowledge-bases
 * @desc List pwc_tars knowledge bases with document/chunk/token stats.
 * @access Admin (pwc_tars)
 */
router.get('/knowledge-bases', async (req, res) => {
  try {
    const knowledgeBases = await fetchTarsKnowledgeBases(req.user.tarsId);
    return res.json({ knowledgeBases });
  } catch (error) {
    logger.error('[GET /api/tars/knowledge-bases] Failed', error);
    return res.status(500).json({ error: 'Failed to fetch pwc_tars knowledge bases' });
  }
});

/**
 * @route GET /api/tars/knowledge-bases/models
 * @desc LLM / embedding / rerank model options for the upload form.
 * @access Admin (pwc_tars)
 */
router.get('/knowledge-bases/models', async (req, res) => {
  try {
    const models = await fetchTarsModelOptions();
    return res.json(models);
  } catch (error) {
    logger.error('[GET /api/tars/knowledge-bases/models] Failed', error);
    return res.status(500).json({ error: 'Failed to fetch pwc_tars model options' });
  }
});

/**
 * @route POST /api/tars/knowledge-bases
 * @desc Create an empty knowledge base.
 * @access Admin (pwc_tars)
 */
router.post('/knowledge-bases', async (req, res) => {
  try {
    const knowledgeBase = await createTarsKnowledgeBase(req.user.tarsId, req.body ?? {});
    return res.status(201).json({ knowledgeBase });
  } catch (error) {
    logger.error('[POST /api/tars/knowledge-bases] Failed', error);
    return res.status(500).json({ error: 'Failed to create pwc_tars knowledge base' });
  }
});

/**
 * @route POST /api/tars/knowledge-bases/upload
 * @desc Create a knowledge base from an uploaded file (pwc_tars handles indexing).
 * @access Admin (pwc_tars)
 */
router.post('/knowledge-bases/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A file is required' });
  }
  const {
    knowledgeName,
    description,
    tags,
    llmModel,
    embeddingModel,
    rerankModel,
    maxRetrieveCount,
  } = req.body ?? {};
  if (!knowledgeName || !llmModel) {
    return res.status(400).json({ error: 'knowledgeName and llmModel are required' });
  }

  try {
    const result = await createTarsKnowledgeBaseWithFile(req.user.tarsId, {
      knowledgeName,
      description,
      tags,
      llmModel,
      embeddingModel,
      rerankModel,
      maxRetrieveCount: maxRetrieveCount != null ? Number(maxRetrieveCount) : undefined,
      file: {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
      },
    });
    return res.status(201).json(result);
  } catch (error) {
    logger.error('[POST /api/tars/knowledge-bases/upload] Failed', error);
    return res.status(500).json({ error: 'Failed to upload pwc_tars knowledge base' });
  }
});

/**
 * @route PUT /api/tars/knowledge-bases/:id
 * @desc Update a knowledge base (name/description/retrieve count/domain binding).
 * @access Admin (pwc_tars)
 */
router.put('/knowledge-bases/:id', async (req, res) => {
  try {
    const knowledgeBase = await updateTarsKnowledgeBase(
      req.user.tarsId,
      req.params.id,
      req.body ?? {},
    );
    return res.json({ knowledgeBase });
  } catch (error) {
    logger.error('[PUT /api/tars/knowledge-bases/:id] Failed', error);
    return res.status(500).json({ error: 'Failed to update pwc_tars knowledge base' });
  }
});

/**
 * @route DELETE /api/tars/knowledge-bases/:id
 * @desc Delete a knowledge base (pwc_tars cascades Milvus / chunks / documents).
 * @access Admin (pwc_tars)
 */
router.delete('/knowledge-bases/:id', async (req, res) => {
  try {
    await deleteTarsKnowledgeBase(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/tars/knowledge-bases/:id] Failed', error);
    return res.status(500).json({ error: 'Failed to delete pwc_tars knowledge base' });
  }
});

module.exports = router;
