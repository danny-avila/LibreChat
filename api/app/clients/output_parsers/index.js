const addImages = require('./addImages');
const handleInputs = require('./handleInputs');
const handleOutputs = require('./handleOutputs');

module.exports = {
  addImages,
  ...handleInputs,
  ...handleOutputs,
};
