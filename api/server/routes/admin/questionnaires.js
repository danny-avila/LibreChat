const express = require('express');
const { createAdminQuestionnairesHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireRead = requireCapability(SystemCapabilities.READ_QUESTIONNAIRES);
const requireManage = requireCapability(SystemCapabilities.MANAGE_QUESTIONNAIRES);

const handlers = createAdminQuestionnairesHandlers({
  listQuestionnaires: db.listQuestionnaires,
  getQuestionnaireById: db.getQuestionnaireById,
  saveQuestionnaire: db.saveQuestionnaire,
  setQuestionnaireStatus: db.setQuestionnaireStatus,
  duplicateQuestionnaire: db.duplicateQuestionnaire,
  deleteQuestionnaire: db.deleteQuestionnaire,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireRead, handlers.listQuestionnaires);
router.get('/:id', requireRead, handlers.getQuestionnaire);
router.post('/', requireManage, handlers.createQuestionnaire);
router.put('/:id', requireManage, handlers.updateQuestionnaire);
router.patch('/:id/status', requireManage, handlers.setStatus);
router.post('/:id/duplicate', requireManage, handlers.duplicateQuestionnaire);
router.delete('/:id', requireManage, handlers.deleteQuestionnaire);

module.exports = router;
