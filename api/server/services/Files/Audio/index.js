const getVoices = require('./getVoices');
const textToSpeech = require('./textToSpeech');
const speechToText = require('./speechToText');
const { updateTokenWebsocket } = require('./webSocket');

module.exports = {
  getVoices,
  speechToText,
  ...textToSpeech,
  updateTokenWebsocket,
};
