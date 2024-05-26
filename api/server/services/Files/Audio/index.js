const getVoices = require('./getVoices');
const getCustomConfigSpeech = require('./getCustomConfigSpeech');
const textToSpeech = require('./textToSpeech');
const speechToText = require('./speechToText');

module.exports = {
  getVoices,
  getCustomConfigSpeech,
  speechToText,
  ...textToSpeech,
};
