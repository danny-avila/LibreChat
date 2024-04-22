const { addUserToRoom } = require('~/models/Room');
const { v4: uuidV4 } = require('uuid');
const { getRoom, getRoomsByUser, saveConvo, saveMessage } = require('~/models');
const bcrypt = require('bcryptjs');

const createNewRoom = async (req, res) => {
  // const { title, isPrivate, password, endpoint } = req.body;
  const body = req.body;

  const createdAt = new Date();
  const newConversationId = uuidV4();
  let password = '';
  if (body.password && body.isPrivate) {
    console.log('--- lock password ---', body.password);
    password = await new Promise((resolve, reject) => {
      bcrypt.hash(body.password, 10, function (err, hash) {
        if (err) {
          reject(err);
        } else {
          resolve(hash);
        }
      });
    });
  }
  try {
    await saveConvo(req.user._id, {
      conversationId: body.conversationId,
      newConversationId,
      ...body,
      password,
      createdAt,
    });

    const result = await getRoom(req.user._id, newConversationId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const getRoomById = async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await getRoom(req.user._id, roomId);
    return res.json(room);
  } catch (error) {
    return res.status(500).json(error);
  }
};

// const getUsersByRoomId = async (req, res) => {
//   const { roomId } = req.params;
//   try {
//     const users = await Conversation
//   } catch (error) {
//     return res.status(500).json(error);
//   }
// }

const getRoomByUser = async (req, res) => {
  try {
    const room = await getRoomsByUser(req.user._id);
    return res.json(room);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const createNewMessage = async (req, res) => {
  try {
    const result = await saveMessage({
      user: req.user.id,
      unfinished: false,
      files: [],
      ...req.body,
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const joinRoom = async (req, res) => {
  const { password } = req.body;
  const { roomId } = req.params;
  const userId = req.user._id;
  try {
    const result = await addUserToRoom(roomId, userId, password);
    if (result.error) {
      return res.status(400).json(result.error);
    }
    res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

module.exports = {
  createNewRoom,
  getRoomById,
  getRoomByUser,
  createNewMessage,
  joinRoom,
};
