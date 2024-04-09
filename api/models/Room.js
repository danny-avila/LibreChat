const bcrypt = require('bcryptjs');
const Room = require('./schema/roomSchema');
const logger = require('~/config/winston');
const uuid = require('uuid');

/**
 *
 * @param {string} name
 * @returns [Room]
 */
const getRooms = async (name) => {
  try {
    const rooms = await Room.find({ name: RegExp(name, 'i') });
    return rooms;
  } catch (error) {
    logger.error('[getRooms] Error getting entire rooms', error);
    return { message: 'Error getting Rooms by name' };
  }
};

/**
 *
 * @param {string} userId
 * @returns [Room]
 */
const getRoomsByUser = async (userId) => {
  try {
    const ownedRooms = await Room.find({ user: userId });
    const joinedRooms = await Room.find({
      users: { $elemMatch: { $eq: userId } },
    });

    return [...ownedRooms, joinedRooms];
  } catch (error) {
    logger.error('[getRoomsByUser] ERror getting rooms by user', error);
    return { message: 'Error getting rooms by user' };
  }
};

/**
 *
 * @param {string} user
 * @param {string} roomId
 * @returns Room
 */
const getRoom = async (user, roomId) => {
  try {
    return await Room.findOne({ user, roomId }).lean();
  } catch (error) {
    logger.error('[getRoom] Error getting single room', error);
    return { message: 'Error getting single room' };
  }
};

/**
 *
 * @param {string} name
 * @param {boolean} isPrivate
 * @param {string} password
 * @param {UserID} user
 * @returns new Room
 */
const createRoom = async (name, isPrivate, password, user) => {
  try {
    const hashedPassword = await new Promise((resolve, reject) => {
      bcrypt.hash(password, 10, function (err, hash) {
        if (err) {
          reject(err);
        } else {
          resolve(hash);
        }
      });
    });
    const newRoom = new Room({
      roomId: uuid.v4(),
      name,
      isPrivate,
      password: hashedPassword,
      user,
    });
    return await newRoom.save();
  } catch (error) {
    logger.error('[createRoom] Error creating new room', error);
    return { message: 'Error creating new room' };
  }
};

module.exports = {
  Room,
  getRoom,
  getRooms,
  getRoomsByUser,
  createRoom,
};
