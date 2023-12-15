const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../../models/User');
const path = require('path');
const fs = require('fs');

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

router.get('/:userId', (req, res) => {
  const userId = req.params.userId;
  const dirPath = path.join(__dirname, `../../../images/${userId}`);

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      console.error('Error reading directory');
      res.status(500).json({ message: 'Server error' });
    } else if (files.length === 0) {
      console.error('No files in directory');
      res.status(404).json({ message: 'Image not found' });
    } else {
      const imagePath = path.join(dirPath, files[0]);
      res.sendFile(imagePath);
    }
  });
});

module.exports = router;
