const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../../models/User');

const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { requireJwtAuth } = require('../middleware/');
const { getUserController } = require('../controllers/AuthController');

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

    const url = await uploadProfilePicture(userId, input, manual);
    res.json({ url });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'An error occurred while uploading the profile picture' });
  }
});

module.exports = router;
