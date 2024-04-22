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
    const rooms = await Conversation.find({ name: RegExp(name, 'i'), isRoom: true })
      .populate('user')
      .populate('users');
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
    const owned = await Conversation.find({ user: userId, isRoom: true })
      .populate('user')
      .populate('users');
    const joined = await Conversation.find({
      users: { $elemMatch: { $eq: userId } },
      isRoom: true,
    });

    return [...owned, ...joined];
  } catch (error) {
    logger.error('[getRoomsByUser] ERror getting rooms by user', error);
    return { message: 'Error getting rooms by user' };
  }
};

/**
 *
 * @param {string} user
 * @param {string} conversationId
 * @returns Room
 */
const getRoom = async (user, conversationId) => {
  try {
    return await Conversation.findOne({ user, conversationId, isRoom: true })
      .populate('user')
      .populate('users')
      .lean();
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
const addUserToRoom = async (conversationId, userId, password) => {
  try {
    const room = await Conversation.findOne({ conversationId });
    let isPasswordCorrect = false;
    if (room.isPrivate && room.password && password) {
      isPasswordCorrect = await new Promise((resolve, reject) => {
        bcrypt.compare(password, room.password, (err, isMatch) => {
          console.log('hashing', isMatch);
          if (err) {
            reject('error in bcrypt hash');
          }
          resolve(isMatch);
        });
      });
    }

    if (!isPasswordCorrect) {
      return { error: 'Password is incorrect' };
    }
    await Conversation.findOneAndUpdate({ conversationId }, { $addToSet: { users: userId } });
    const result = await Conversation.findOne({ conversationId })
      .populate('users')
      .populate('user');
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
