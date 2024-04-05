const Room = require('./schema/roomSchema');
const logger = require('~/config/winston');

const getRoom = async (user, roomId) => {
  try {
    return await Room.findOne({ user, roomId }).lean();
  } catch (error) {
    logger.error('[getRoom] Error getting single room', error);
    return { message: 'Error getting single room' };
  }
};

module.exports = {
  Room,
  getRoom,
};
