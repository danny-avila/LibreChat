const { textToSpeech, streamAudioFromWebSocket } = require('./textToSpeech');
const speechToText = require('./speechToText');
const getVoices = require('./getVoices');
const { updateTokenWebsocket } = require('./webSocket');

module.exports = {
  textToSpeech,
  speechToText,
  getVoices,
  updateTokenWebsocket,
  streamAudioFromWebSocket,
};
