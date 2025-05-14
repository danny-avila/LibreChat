const mongoose = require('mongoose');
const { userSchema } = require('@librechat/data-schemas');

const User = mongoose.model('User', userSchema);

module.exports = User;
