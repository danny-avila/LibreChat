const { v4: uuidV4 } = require('uuid');
const { getRoom, getRoomsByUser, saveConvo, saveMessage } = require('~/models');

const createNewRoom = async (req, res) => {
  // const { title, isPrivate, password, endpoint } = req.body;
  console.log('=== RoomController -> createNewRoom ===', req.body);
  const body = req.body;

  const createdAt = new Date();
  try {
    const result = await saveConvo(req.user._id, {
      conversationId: body.conversationId,
      newConversationId: uuidV4(),
      ...body,
      createdAt,
    });
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
    console.log('=== created new meessage ===', result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

module.exports = {
  createNewRoom,
  getRoomById,
  getRoomByUser,
  createNewMessage,
};
