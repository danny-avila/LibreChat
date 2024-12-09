const { logger } = require('~/config');
const mongoose = require('mongoose');
const userSchema = require('~/models/schema/userSchema');

const User = mongoose.model('User', userSchema);

User.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create User index ${error}`);
  }
});

module.exports = User;
