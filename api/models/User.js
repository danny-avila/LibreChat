const mongoose = require('mongoose');
const userSchema = require('~/models/schema/userSchema');

const User = mongoose.model('User', userSchema);

module.exports = User;
