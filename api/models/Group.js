const mongoose = require('mongoose');
const { groupSchema } = require('@librechat/data-schemas');

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
