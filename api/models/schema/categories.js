const { logger } = require('~/config');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const categoriesSchema = new Schema({
  label: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
    unique: true,
  },
});

const Categories = mongoose.model('categories', categoriesSchema);

Categories.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create Categories index ${error}`);
  }
});

module.exports = Categories;
