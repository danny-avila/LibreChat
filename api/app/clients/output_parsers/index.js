const addImages = require('./addImages');
const handleOutputs = require('./handleOutputs');

module.exports = {
  addImages,
  ...handleOutputs,
};
