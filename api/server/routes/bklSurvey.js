const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const router = express.Router();
router.use(requireJwtAuth);

function getDb() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) {
    throw new Error('MongoDB not connected');
  }
  return conn.db;
}

/**
 * 항목 5(b): 사용자용 설문 API — 활성 설문 조회 + 응답 제출.
 * 클라이언트는 공지 팝업 인프라를 재사용해 미응답 설문을 모달로 띄운다.
 */

router.get('/active', async (req, res) => {
  try {
    const db = getDb();
    const now = new Date();
    const surveys = await db
      .collection('bkl_surveys')
      .find({
        active: true,
        displayFrom: { $lte: now },
        $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    if (!surveys.length) {
      return res.json({ data: [] });
    }

    const answered = await db
      .collection('bkl_survey_responses')
      .find(
        { surveyId: { $in: surveys.map((s) => s.surveyId) }, user: String(req.user.id) },
        { projection: { surveyId: 1 } },
      )
      .toArray();
    const answeredSet = new Set(answered.map((a) => a.surveyId));

    res.json({
      data: surveys
        .filter((s) => !answeredSet.has(s.surveyId))
        .map((s) => ({
          surveyId: s.surveyId,
          title: s.title,
          description: s.description,
          questions: s.questions,
        })),
    });
  } catch (err) {
    logger.error('[bklSurvey] active fetch failed', err);
    res.status(500).json({ error: 'Error getting surveys' });
  }
});

router.post('/respond', async (req, res) => {
  try {
    const { surveyId, answers } = req.body || {};
    if (!surveyId || typeof answers !== 'object' || answers == null) {
      return res.status(400).json({ error: 'surveyId and answers required' });
    }
    const db = getDb();
    const survey = await db.collection('bkl_surveys').findOne({ surveyId });
    if (!survey) {
      return res.status(404).json({ error: 'survey not found' });
    }
    await db.collection('bkl_survey_responses').updateOne(
      { surveyId, user: String(req.user.id) },
      {
        $set: { answers, updatedAt: new Date() },
        $setOnInsert: { surveyId, user: String(req.user.id), createdAt: new Date() },
      },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('[bklSurvey] respond failed', err);
    res.status(500).json({ error: 'Error saving response' });
  }
});

module.exports = router;
