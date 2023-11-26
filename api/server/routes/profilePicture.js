const express = require('express');
const router = express.Router();

const uploadProfilePictureFromURL = require('~/server/services/ProfilePictureCreate');
const { requireJwtAuth } = require('../middleware/');
const { getUserController } = require('../controllers/AuthController');

router.get('/', requireJwtAuth, getUserController);

router.post('/', async (req, res) => {
  try {
    const { userId, imageUrl } = req.body;
    const url = await uploadProfilePictureFromURL(userId, imageUrl);
    res.json({ url });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ message: 'An error occurred while uploading the profile picture' });
  }
});

module.exports = router;
