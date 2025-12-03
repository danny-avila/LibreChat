const getCustomConfigSpeech = require('./getCustomConfigSpeech');
const TTSService = require('./TTSService');
const STTService = require('./STTService');
const getVoices = require('./getVoices');

module.exports = {
  getVoices,
  getCustomConfigSpeech,
  ...STTService,
  ...TTSService,
};
