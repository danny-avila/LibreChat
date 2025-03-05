const mongoose = require('mongoose');
const groupSchema = require('~/models/schema/groupSchema');

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
