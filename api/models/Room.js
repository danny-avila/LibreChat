const bcrypt = require('bcryptjs');
const Conversation = require('./schema/convoSchema');
const logger = require('~/config/winston');
const uuid = require('uuid');

/**
 *
 * @param {string} name
 * @returns [Room]
 */
const getRooms = async (name) => {
  try {
    const rooms = await Conversation.find({ name: RegExp(name, 'i'), isRoom: true });
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
    const owned = await Conversation.find({ user: userId, isRoom: true });
    const joined = await Conversation.find({
      users: { $elemMatch: { $eq: userId } },
      isRoom: true,
    });

    return { owned, joined };
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
    return await Conversation.findOne({ user, roomId, isRoom: true }).lean();
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
    const newRoom = new Conversation({
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

/**
 * @param {string} conversationId
 * @param {string} userId
 * @returns ConvoSchema
 */
const addUserToRoom = async (conversationId, userId) => {
  try {
    const result = await Conversation.findOneAndUpdate(
      { conversationId },
      { $addToSet: { users: userId } },
      { new: true },
    );
    return result;
  } catch (error) {
    logger.error('[addUserToRoom] Error creating new room', error);
    return { message: 'Error adding user to room' };
  }
};

module.exports = {
  Room: Conversation,
  getRoom,
  getRooms,
  getRoomsByUser,
  createRoom,
  addUserToRoom,
};
