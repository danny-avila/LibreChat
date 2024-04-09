const { createRoom, getRoom, getRoomsByUser } = require('~/models');

const createNewRoom = async (req, res) => {
  const { name, isPrivate, password } = req.body;
  try {
    const result = await createRoom(name, isPrivate, password, req.user._id);
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

const getRoomByUser = async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await getRoomsByUser(req.user._id, roomId);
    return res.json(room);
  } catch (error) {
    return res.status(500).json(error);
  }
};

module.exports = {
  createNewRoom,
  getRoomById,
  getRoomByUser,
};
