const { logger } = require('~/config');
const mongoose = require('mongoose');
const keySchema = require('./schema/key');

const Key = mongoose.model('Key', keySchema);

Key.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create Key index ${error}`);
  }
});

module.exports = Key;
