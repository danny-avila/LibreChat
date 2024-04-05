const mongoose = require('mongoose');
const mongoMeili = require('../plugins/mongoMeili');
const roomSchema = mongoose.Schema(
  {
    roomId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  },
  { timestamps: true },
);

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  roomSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'rooms', // Will get created automatically if it doesn't exist already
    primaryKey: 'roomId',
  });
}

roomSchema.index({ createdAt: 1, updatedAt: 1 });

const Room = mongoose.models.Conversation || mongoose.model('Room', roomSchema);

module.exports = Room;
