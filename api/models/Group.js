const mongoose = require('mongoose');
const { GroupSchema } = require('@librechat/data-schemas');

const Group = mongoose.model('Group', GroupSchema);

module.exports = Group;