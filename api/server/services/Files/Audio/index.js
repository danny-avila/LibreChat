const getCustomConfigSpeech = require('./getCustomConfigSpeech');
const getRealtimeConfig = require('./getRealtimeConfig');
const TTSService = require('./TTSService');
const STTService = require('./STTService');
const getVoices = require('./getVoices');

module.exports = {
  getVoices,
  getCustomConfigSpeech,
  getRealtimeConfig,
  ...STTService,
  ...TTSService,
};
