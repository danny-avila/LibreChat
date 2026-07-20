const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./helpers');

const router = express.Router();

/**
 * 항목 10: 공지/AI 정책 팝업 관리 — 기존 Banner 컬렉션의 `type: 'popup'` 활용.
 * `type: 'banner'` 도 함께 관리 가능 (상단 띠 배너).
 */

router.get('/notices', async (_req, res) => {
  try {
    const notices = await getDb()
      .collection('banners')
      .find({})
      .sort({ displayFrom: -1 })
      .toArray();
    res.json({ data: notices });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.post('/notices', async (req, res) => {
  try {
    const { title, message, type, displayFrom, displayTo, isPublic, persistable } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }
    const doc = {
      bannerId: uuidv4(),
      title: title || null,
      message,
      type: type === 'banner' ? 'banner' : 'popup',
      displayFrom: displayFrom ? new Date(displayFrom) : new Date(),
      displayTo: displayTo ? new Date(displayTo) : null,
      isPublic: isPublic !== false,
      persistable: persistable === true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await getDb().collection('banners').insertOne(doc);
    res.status(201).json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.put('/notices/:bannerId', async (req, res) => {
  try {
    const { title, message, type, displayFrom, displayTo, isPublic, persistable } = req.body || {};
    const $set = { updatedAt: new Date() };
    if (title !== undefined) {
      $set.title = title;
    }
    if (message !== undefined) {
      $set.message = message;
    }
    if (type !== undefined) {
      $set.type = type === 'banner' ? 'banner' : 'popup';
    }
    if (displayFrom !== undefined) {
      $set.displayFrom = displayFrom ? new Date(displayFrom) : new Date();
    }
    if (displayTo !== undefined) {
      $set.displayTo = displayTo ? new Date(displayTo) : null;
    }
    if (isPublic !== undefined) {
      $set.isPublic = isPublic === true;
    }
    if (persistable !== undefined) {
      $set.persistable = persistable === true;
    }
    const result = await getDb()
      .collection('banners')
      .updateOne({ bannerId: req.params.bannerId }, { $set });
    if (!result.matchedCount) {
      return res.status(404).json({ error: 'notice not found' });
    }
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

router.delete('/notices/:bannerId', async (req, res) => {
  try {
    const result = await getDb()
      .collection('banners')
      .deleteOne({ bannerId: req.params.bannerId });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'notice not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message) });
  }
});

module.exports = router;
