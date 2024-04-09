const express = require('express');
const {
  createNewRoom,
  getRoomById,
  getRoomByUser,
} = require('~/server/controllers/RoomController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();

router.use(requireJwtAuth);

router.post('/', createNewRoom);
router.get('/', getRoomByUser);
router.get('/:roomId', getRoomById);

module.exports = router;
