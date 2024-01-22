const multer = require('multer');
const express = require('express');
const { uploadAvatar } = require('~/server/services/Files/images/avatar');
const { logger } = require('~/config');

const upload = multer();
const router = express.Router();

router.post('/', upload.single('input'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { manual } = req.body;
    const input = req.file.buffer;

    if (!userId) {
      throw new Error('User ID is undefined');
    }

    const url = await uploadAvatar({
      input,
      userId,
      manual,
      fileStrategy: req.app.locals.fileStrategy,
    });

    res.json({ url });
  } catch (error) {
    const message = 'An error occurred while uploading the profile picture';
    logger.error(message, error);
    res.status(500).json({ message });
  }
});

module.exports = router;
