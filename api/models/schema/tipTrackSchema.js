const mongoose = require('mongoose');

const tipTrackSchema = mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    network: {
      type: String,
    },
    status: {
      type: String,
      default: 'Pending',
      enum: ['Pending', 'Confirmed'],
    },
    convoId: {
      type: String,
      required: true,
    },
    sendType: {
      type: String,
      default: 'tip',
      enum: ['karma', 'tip'],
    },
    karma: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('TipTrack', tipTrackSchema);
