const express = require('express');
const multer = require('multer');

const uploadAvatar = require('~/server/services/Files/images/avatar/uploadAvatar');
const { requireJwtAuth } = require('~/server/middleware/');
const User = require('~/models/User');

const upload = multer();
const router = express.Router();

router.post('/', requireJwtAuth, upload.single('input'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { manual } = req.body;
    const input = req.file.buffer;
    if (!userId) {
      throw new Error('User ID is undefined');
    }

    // TODO: do not use Model directly, instead use a service method that uses the model
    const user = await User.findById(userId).lean();

    if (!user) {
      throw new Error('User not found');
    }
    const url = await uploadAvatar(userId, input, manual);

    res.json({ url });
  } catch (error) {
    res.status(500).json({ message: 'An error occurred while uploading the profile picture' });
  }
});

module.exports = router;
