const express = require('express');
const router = express.Router();
const multer = require('multer');

const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { requireJwtAuth } = require('../middleware/');
const { getUserController } = require('../controllers/AuthController');

const upload = multer();

router.get('/', requireJwtAuth, getUserController);

router.post('/', upload.single('input'), async (req, res) => {
  try {
    const { userId } = req.body;
    const input = req.file.buffer;

    if (!userId) {
      throw new Error('User ID is undefined');
    }

    const url = await uploadProfilePicture(userId, input);
    res.json({ url });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'An error occurred while uploading the profile picture' });
  }
});

module.exports = router;
