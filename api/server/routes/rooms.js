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

router.get('/', getRoomsByQuery);
router.get('/query', requireJwtAuth, getRoomByUser);
router.post('/', requireJwtAuth, createNewRoom);
router.post('/:roomId/report', requireJwtAuth, reportRoom);
router.post('/join/:roomId', requireJwtAuth, joinRoom);
router.post('/leave/:roomId', requireJwtAuth, leaveRoom);
router.post('/kick/:roomId', requireJwtAuth, kickUser);
router.get('/', requireJwtAuth, getRoomByUser);
router.get('/:roomId', getRoomById);
router.get('/:roomId/users', requireJwtAuth, getRoomById);
router.post('/:roomId', requireJwtAuth, createNewMessage);

module.exports = router;
