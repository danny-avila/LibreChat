const express = require('express');
const { logger } = require('@librechat/data-schemas');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getActiveQuestionnaire,
  submitQuestionnaireResponse,
  dismissQuestionnaire,
} = require('~/models');

const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    const { questionnaire, completed, dismissedAt } = await getActiveQuestionnaire(req.user);
    res.status(200).send({ questionnaire, completed, dismissedAt });
  } catch (error) {
    logger.error('[getQuestionnaire] Error getting questionnaire', error);
    res.status(500).json({ message: 'Error getting questionnaire' });
  }
});

router.post('/dismiss', requireJwtAuth, async (req, res) => {
  try {
    const { questionnaireId } = req.body;
    if (!questionnaireId) {
      return res.status(400).json({ message: 'questionnaireId is required' });
    }

    const { questionnaire } = await getActiveQuestionnaire(req.user);
    if (!questionnaire || questionnaire.questionnaireId !== questionnaireId) {
      return res.status(409).json({ message: 'This questionnaire is no longer active' });
    }

    const dismissal = await dismissQuestionnaire(req.user.id, questionnaireId);
    res.status(200).json({ success: true, dismissedAt: dismissal.dismissedAt });
  } catch (error) {
    logger.error('[dismissQuestionnaire] Error dismissing questionnaire', error);
    res.status(500).json({ message: 'Error dismissing questionnaire' });
  }
});

router.post('/response', requireJwtAuth, async (req, res) => {
  try {
    const { questionnaireId, answers } = req.body;

    if (!questionnaireId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ message: 'questionnaireId and answers are required' });
    }

    const { questionnaire } = await getActiveQuestionnaire(req.user);
    if (!questionnaire || questionnaire.questionnaireId !== questionnaireId) {
      return res.status(409).json({ message: 'This questionnaire is no longer active' });
    }

    const requiredIds = questionnaire.questions
      .filter((question) => question.required)
      .map((question) => question.id);
    const answeredIds = new Set(answers.map((answer) => answer.questionId));
    const missing = requiredIds.filter((id) => !answeredIds.has(id));
    if (missing.length > 0) {
      return res.status(400).json({ message: 'Missing required answers', missing });
    }

    await submitQuestionnaireResponse(req.user.id, questionnaireId, answers);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('[submitQuestionnaireResponse] Error submitting response', error);
    if (error.message && error.message.includes('already responded')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error submitting questionnaire response' });
  }
});

module.exports = router;
