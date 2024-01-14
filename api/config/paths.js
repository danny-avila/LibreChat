const path = require('path');

module.exports = {
  dist: path.resolve(__dirname, '..', '..', 'client', 'dist'),
  publicPath: path.resolve(__dirname, '..', '..', 'client', 'public'),
  imageOutput: path.resolve(__dirname, '..', '..', 'client', 'public', 'images'),
};
