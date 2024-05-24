const getVoices = require('./getVoices');
const textToSpeech = require('./textToSpeech');
const speechToText = require('./speechToText');

module.exports = {
  getVoices,
  speechToText,
  ...textToSpeech,
};
