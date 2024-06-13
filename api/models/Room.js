const bcrypt = require('bcryptjs');
const Conversation = require('./schema/convoSchema');
const logger = require('~/config/winston');
const uuid = require('uuid');

/**
 *
 * @param {string} name
 * @returns [Room]
 */
const getRooms = async (name = '', roomIndex = 'user', sort, endpoint) => {
  try {
    let rooms;
    const sortQuery = {};
    // if (sort === 'participants-asc') {
    //   sortQuery['users.length'] = -1;
    // } else if (sort === 'participants-desc') {
    //   sortQuery['users.length'] = 1;
    // } else
    if (sort === 'date-asc') {
      sortQuery['createdAt'] = 1;
    } else if (sort === 'date-desc') {
      sortQuery['createdAt'] = -1;
    }

    let findQuery = {
      title: RegExp(name, 'i'),
      isRoom: true,
    };

    if (endpoint !== 'null') {
      findQuery.endpoint = endpoint;
    }
    console.log('--- sortQuery ---', sortQuery);
    console.log('--- findQuery ---', findQuery, endpoint);

    if (roomIndex === 'all') {
      rooms = await Conversation.find(findQuery)
        .sort(sortQuery)
        .populate('user')
        .populate('users');
    } else {
      rooms = await Conversation.find({
        ...findQuery,
        $or: [
          { user: roomIndex },
          { users: { $in: [roomIndex] } },
        ],
      })
        .sort(sortQuery)
        .populate('user')
        .populate('users');
    }

    console.log(rooms.map(i => ({ title: i.title, createdAt: i.createdAt, users: i.users.length })));

    return rooms.reverse();
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
const getRoom = async (conversationId) => {
  try {
    return await Conversation.findOne({ conversationId, isRoom: true })
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
    console.log(room.bannedUsers, userId);
    // Check if the user is banned in the room
    if (room.bannedUsers.indexOf(userId) > -1) {
      return { error: 'This user is banned in the room' };
    }

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
    } else {
      isPasswordCorrect = true;
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

/**
 * @param {string} conversationId
 * @param {string} userId
 * @returns ConvoSchema
 */
const removeUserFromRoom = async (conversationId, userId, isBanned = false) => {
  try {
    const room = await Conversation.findOne({ conversationId });
    if (room.user.toString() === userId.toString()) {
      const poppedUser = room.users.shift();

      room.user = poppedUser;
      await room.save();
    } else {
      const userIndex = room.users.map((u) => u.toString()).indexOf(userId);
      room.users.splice(userIndex);
      if (isBanned && room.bannedUsers.indexOf(userId) > -1) {
        room.bannedUsers.push(userId);
      }
      await room.save();
    }

    const result = await Conversation.findOne({ conversationId })
      .populate('users')
      .populate('user');
    return result;
  } catch (error) {
    logger.error('[removeuserFromRoom] Error remove users in the room', error);
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
  removeUserFromRoom,
};
