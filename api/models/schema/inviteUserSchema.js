const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const inviteUserSchema = new Schema({
  email: {
    required: true,
    type: String,
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    expires: 604800,
  },
});

module.exports = mongoose.model('InviteUser', inviteUserSchema);
