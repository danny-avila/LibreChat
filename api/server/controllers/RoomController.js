const { addUserToRoom } = require('~/models/Room');
const { v4: uuidV4 } = require('uuid');
const {
  getRoom,
  getRoomsByUser,
  saveConvo,
  saveMessage,
  removeUserFromRoom,
  getConvo,
  getConvosByQuery,
} = require('~/models');
const bcrypt = require('bcryptjs');
const ReportModel = require('~/models/Report');

const getRoomsByQuery = async (req, res) => {
  try {
    const rooms = await getConvosByQuery(req.query.title ?? '', req.query.endpoint ?? '', req.query.sort ?? 'participants', req.query.order ?? 'asc');
    return res.json(rooms.filter(i => i.user)).map(i => ({ ...i, userLength: i.uesrLength + 1 }));
  } catch (error) {
    return res.status(500).json(error);
  }
};

const createNewRoom = async (req, res) => {
  // const { title, isPrivate, password, endpoint } = req.body;
  const body = req.body;

  const createdAt = new Date();
  const newConversationId = uuidV4();
  let password = '';
  if (body.password && body.isPrivate) {
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
    const newConvo = await saveConvo(req.user._id, {
      conversationId: body.conversationId,
      newConversationId,
      ...body,
      password,
      createdAt,
    });

    const result = await getRoom(newConvo.conversationId);

    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const getRoomById = async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await getRoom(roomId);
    return res.json(room);
  } catch (error) {
    return res.status(500).json(error);
  }
};

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

const leaveRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user._id;
  try {
    const result = await removeUserFromRoom(roomId, userId);
    if (result.error) {
      return res.status(400).json(result.error);
    }
    res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const kickUser = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const result = await removeUserFromRoom(roomId, userId, true);

    res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

/**
 * @param {Request} req
 * @param {Response} res
 * @returns
 */
const reportRoom = async (req, res) => {
  const { roomId } = req.params;
  const { reason } = req.body;

  try {
    const room = await getConvo(req.user, roomId);

    const report = await ReportModel.findOne({
      user: req.user._id,
      room: room._id,
    });

    if (report && report.accepted) {
      return res.status(400).json({
        message: 'You have already reported this room',
      });
    }

    const newReport = new ReportModel({
      user: req.user._id,
      room: room._id,
      description: reason,
      reportType: 'room',
    });

    const result = await newReport.save();

    res.json(result);
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
};

module.exports = {
  createNewRoom,
  getRoomById,
  getRoomByUser,
  createNewMessage,
  joinRoom,
  leaveRoom,
  kickUser,
  reportRoom,
  getRoomsByQuery,
};
