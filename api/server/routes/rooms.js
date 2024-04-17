const express = require('express');
const {
  createNewRoom,
  getRoomById,
  getRoomByUser,
  createNewMessage,
} = require('~/server/controllers/RoomController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();

router.use(requireJwtAuth);

router.post('/', createNewRoom);
router.post('/:roomId', createNewMessage);
router.get('/', getRoomByUser);
router.get('/:roomId', getRoomById);
router.get('/:roomId/users', getRoomById);

module.exports = router;
