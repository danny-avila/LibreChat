const express = require('express');
const { createNewRoom, getRoomById } = require('~/server/controllers/RoomController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();

router.use(requireJwtAuth);

router.post('/', createNewRoom);
router.get('/:roomId', getRoomById);

module.exports = router;
