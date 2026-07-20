const express = require('express');

const { getBanner, getPopupNotices } = require('~/models/Banner');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  try {
    res.status(200).send(await getBanner(req.user));
  } catch (error) {
    res.status(500).json({ message: 'Error getting banner' });
  }
});

/** BKL (항목 10): 활성 popup 공지 목록 */
router.get('/popup', optionalJwtAuth, async (req, res) => {
  try {
    res.status(200).json({ data: await getPopupNotices(req.user) });
  } catch (error) {
    res.status(500).json({ message: 'Error getting popup notices' });
  }
});

module.exports = router;
