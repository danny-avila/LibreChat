const getVoices = require('./getVoices');
const getCustomConfigSpeech = require('./getCustomConfigSpeech');
const TTSService = require('./TTSService');
const STTService = require('./STTService');

module.exports = {
  getVoices,
  getCustomConfigSpeech,
  ...STTService,
  ...TTSService,
};
