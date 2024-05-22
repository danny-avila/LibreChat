const express = require('express');
const {
  createNewRoom,
  getRoomById,
  getRoomByUser,
  createNewMessage,
  joinRoom,
  leaveRoom,
  kickUser,
  reportRoom,
  getRoomsByQuery,
} = require('~/server/controllers/RoomController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/', getRoomsByQuery);
router.post('/', createNewRoom);
router.post('/:roomId/report', reportRoom);
router.post('/join/:roomId', joinRoom);
router.post('/leave/:roomId', leaveRoom);
router.post('/kick/:roomId', kickUser);
router.get('/', getRoomByUser);
router.get('/:roomId', getRoomById);
router.get('/:roomId/users', getRoomById);
router.post('/:roomId', createNewMessage);

module.exports = router;
