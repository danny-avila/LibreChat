const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('~/models/User');

const uploadAvatar = require('~/server/services/Files/images/avatar/avatarCreate.js');
const { requireJwtAuth } = require('~/server/middleware/');
const { getUserController } = require('~/server/controllers/AuthController');

const upload = multer();

router.get('/', requireJwtAuth, getUserController);

router.post('/', upload.single('input'), async (req, res) => {
  try {
    const { userId, manual } = req.body;
    const input = req.file.buffer;
    if (!userId) {
      throw new Error('User ID is undefined');
    }

    const user = await User.findById(userId);

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
