const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { parseDateRange, getDb, loadUsers } = require('./helpers');

const router = express.Router();

/**
 * 항목 5: (a) 메시지 피드백(thumbs) 집계·열람  (b) 설문 관리·결과 조회
 */

/* ── (a) 메시지 피드백 ────────────────────────────────────────── */

router.get('/feedback/summary', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    const data = await getDb()
      .collection('messages')
      .aggregate([
        { $match: { feedback: { $exists: true, $ne: null }, createdAt: range } },
        {
          $group: {
            _id: { model: { $ifNull: ['$model', '(미분류)'] }, rating: '$feedback.rating' },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.model',
            ratings: { $push: { rating: '$_id.rating', count: '$count' } },
            total: { $sum: '$count' },
          },
        },
        { $project: { _id: 0, model: '$_id', ratings: 1, total: 1 } },
        { $sort: { total: -1 } },
      ])
      .toArray();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.get('/feedback/list', async (req, res) => {
  try {
    const { range } = parseDateRange(req.query, 30);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 200, 1000));
    const db = getDb();
    const rows = await db
      .collection('messages')
      .find(
        { feedback: { $exists: true, $ne: null }, createdAt: range },
        {
          projection: {
            messageId: 1,
            conversationId: 1,
            user: 1,
            model: 1,
            feedback: 1,
            text: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const userMap = await loadUsers(db, [...new Set(rows.map((r) => r.user).filter(Boolean))], {
      name: 1,
      username: 1,
      bkl_user_class: 1,
    });

    res.json({
      data: rows.map((row) => {
        const user = userMap.get(String(row.user)) || {};
        return {
          message_id: row.messageId,
          conversation_id: row.conversationId,
          user_id: String(row.user),
          user_name: user.name ?? user.username ?? null,
          user_class: user.bkl_user_class ?? null,
          model: row.model ?? null,
          rating: row.feedback?.rating ?? null,
          tag: row.feedback?.tag ?? null,
          comment: row.feedback?.text ?? null,
          answer_preview: (row.text || '').slice(0, 200),
          created_at: row.createdAt,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/* ── (b) 설문 ─────────────────────────────────────────────────── */

router.get('/surveys', async (_req, res) => {
  try {
    const db = getDb();
    const surveys = await db.collection('bkl_surveys').find({}).sort({ createdAt: -1 }).toArray();
    const counts = await db
      .collection('bkl_survey_responses')
      .aggregate([{ $group: { _id: '$surveyId', responses: { $sum: 1 } } }])
      .toArray();
    const countMap = new Map(counts.map((c) => [c._id, c.responses]));
    res.json({
      data: surveys.map((survey) => ({
        ...survey,
        response_count: countMap.get(survey.surveyId) ?? 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.post('/surveys', async (req, res) => {
  try {
    const { title, description, questions, displayFrom, displayTo, active } = req.body || {};
    if (!title || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'title and questions[] required' });
    }
    /* question: { id, text, type: 'scale5' | 'choice' | 'text', options?: string[] } */
    const doc = {
      surveyId: uuidv4(),
      title,
      description: description || null,
      questions: questions.map((q, i) => ({
        id: q.id || `q${i + 1}`,
        text: String(q.text || ''),
        type: ['scale5', 'choice', 'text'].includes(q.type) ? q.type : 'text',
        options: Array.isArray(q.options) ? q.options.map(String) : undefined,
      })),
      displayFrom: displayFrom ? new Date(displayFrom) : new Date(),
      displayTo: displayTo ? new Date(displayTo) : null,
      active: active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await getDb().collection('bkl_surveys').insertOne(doc);
    res.status(201).json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.put('/surveys/:surveyId', async (req, res) => {
  try {
    const allowed = ['title', 'description', 'questions', 'displayFrom', 'displayTo', 'active'];
    const $set = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) {
        if (key === 'displayFrom' || key === 'displayTo') {
          $set[key] = req.body[key] ? new Date(req.body[key]) : null;
        } else {
          $set[key] = req.body[key];
        }
      }
    }
    const result = await getDb()
      .collection('bkl_surveys')
      .updateOne({ surveyId: req.params.surveyId }, { $set });
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'survey not found' });
    }
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.delete('/surveys/:surveyId', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.collection('bkl_surveys').deleteOne({ surveyId: req.params.surveyId });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'survey not found' });
    }
    await db.collection('bkl_survey_responses').deleteMany({ surveyId: req.params.surveyId });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

/** 결과 조회: 응답률 + 문항별 분포 */
router.get('/surveys/:surveyId/results', async (req, res) => {
  try {
    const db = getDb();
    const survey = await db.collection('bkl_surveys').findOne({ surveyId: req.params.surveyId });
    if (!survey) {
      return res.status(404).json({ error: 'survey not found' });
    }
    const responses = await db
      .collection('bkl_survey_responses')
      .find({ surveyId: req.params.surveyId })
      .sort({ createdAt: -1 })
      .toArray();
    const usersTotal = await db.collection('users').countDocuments({});

    const byQuestion = (survey.questions || []).map((question) => {
      const answers = responses
        .map((r) => (r.answers || {})[question.id])
        .filter((a) => a !== undefined && a !== null && a !== '');
      const distribution = {};
      if (question.type !== 'text') {
        for (const answer of answers) {
          const key = String(answer);
          distribution[key] = (distribution[key] || 0) + 1;
        }
      }
      return {
        id: question.id,
        text: question.text,
        type: question.type,
        answered: answers.length,
        distribution: question.type === 'text' ? undefined : distribution,
        texts: question.type === 'text' ? answers.slice(0, 200) : undefined,
      };
    });

    res.json({
      survey: { surveyId: survey.surveyId, title: survey.title, questions: survey.questions },
      response_count: responses.length,
      users_total: usersTotal,
      response_rate: usersTotal ? responses.length / usersTotal : 0,
      by_question: byQuestion,
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
